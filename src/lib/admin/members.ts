import { getSupabaseServerClient } from "@/lib/supabase-server";
import { issueTicketsForOrder } from "@/lib/tickets/issue";
import { getOrderTickets } from "@/lib/admin/tickets";
import { sendCardEmail } from "@/lib/email/ses";
import { CURRENT_SEASON } from "@/lib/season";
import { parseMemberCsvRows, type CsvColumnMapping } from "@/lib/csv/memberCsv";

export interface MemberInput {
  vorname: string;
  nachname: string;
  email: string;
  kategorie: string | null;
  mitgliederkarte: boolean;
  transferableCodeCount: number;
}

export interface Member {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  kategorie: string | null;
  mitgliederkarte: boolean;
  transferable_code_count: number;
  order_id: string | null;
  cards_sent_at: string | null;
  created_at: string;
}

export async function getAllMembers(): Promise<Member[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("members").select("*").order("nachname", { ascending: true });
  if (error) throw new Error(`Failed to load members: ${error.message}`);
  return data ?? [];
}

/**
 * Inserts the roster row, and - if this member is actually getting a card -
 * creates the order and issues tickets through the exact same pipeline a real
 * shop purchase uses (src/lib/tickets/issue.ts), so PDFs, tokens, and Storage
 * all work identically. Cards are generated immediately; the email itself is a
 * separate, later, explicitly-confirmed step (sendMemberCards).
 */
export async function createMemberAndIssueCards(input: MemberInput): Promise<Member> {
  const supabase = await getSupabaseServerClient();
  const fullName = `${input.vorname} ${input.nachname}`.trim();

  const { data: member, error: memberError } = await supabase
    .from("members")
    .insert({
      vorname: input.vorname,
      nachname: input.nachname,
      email: input.email,
      kategorie: input.kategorie,
      mitgliederkarte: input.mitgliederkarte,
      transferable_code_count: input.transferableCodeCount,
    })
    .select()
    .single();

  if (memberError || !member) {
    throw new Error(memberError?.message ?? "Failed to create member");
  }

  const needsCards = input.mitgliederkarte || input.transferableCodeCount > 0;
  if (!needsCards) {
    return member;
  }

  const { data: orderId, error: orderError } = await supabase.rpc("create_member_order", {
    p_customer_name: fullName,
    p_email: input.email,
    p_include_personal: input.mitgliederkarte,
    p_transferable_count: input.transferableCodeCount,
    p_season: CURRENT_SEASON,
  });

  if (orderError || !orderId) {
    throw new Error(orderError?.message ?? "Failed to create member order");
  }

  await issueTicketsForOrder(orderId);

  const { data: updatedMember, error: updateError } = await supabase
    .from("members")
    .update({ order_id: orderId })
    .eq("id", member.id)
    .select()
    .single();

  if (updateError || !updatedMember) {
    throw new Error(updateError?.message ?? "Failed to link member to their order");
  }

  return updatedMember;
}

export interface CsvImportResult {
  imported: number;
  failed: Array<{ row: number; reason: string }>;
}

export async function importMembersFromCsv(content: string, mapping: CsvColumnMapping): Promise<CsvImportResult> {
  const { rows, errors } = parseMemberCsvRows(content, mapping);
  const failed: Array<{ row: number; reason: string }> = errors.map((reason, index) => ({ row: index, reason }));

  let imported = 0;
  for (let i = 0; i < rows.length; i++) {
    try {
      await createMemberAndIssueCards({
        vorname: rows[i].vorname,
        nachname: rows[i].nachname,
        email: rows[i].email,
        kategorie: rows[i].kategorie,
        mitgliederkarte: rows[i].mitgliederkarte,
        transferableCodeCount: rows[i].transferableCodeCount,
      });
      imported++;
    } catch (error) {
      failed.push({ row: i + 2, reason: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  }

  return { imported, failed };
}

export async function getPendingSendCount(): Promise<number> {
  const supabase = await getSupabaseServerClient();
  const { count } = await supabase
    .from("members")
    .select("*", { count: "exact", head: true })
    .not("order_id", "is", null)
    .is("cards_sent_at", null);
  return count ?? 0;
}

export interface SendCardsResult {
  sent: number;
  failed: Array<{ email: string; reason: string }>;
}

function applyTemplate(template: string, member: Pick<Member, "vorname" | "nachname">): string {
  return template.replaceAll("{{vorname}}", member.vorname).replaceAll("{{nachname}}", member.nachname);
}

/**
 * The one place this whole system sends email. Only touches members that
 * actually have an order (cards were generated) and haven't been sent yet -
 * safe to call again after a partial failure, since already-sent members are
 * automatically skipped rather than re-emailed.
 */
export async function sendPendingMemberCards(subjectTemplate: string, bodyTemplate: string): Promise<SendCardsResult> {
  const supabase = await getSupabaseServerClient();
  const { data: pending, error } = await supabase
    .from("members")
    .select("id, vorname, nachname, email, order_id")
    .not("order_id", "is", null)
    .is("cards_sent_at", null);

  if (error) throw new Error(`Failed to load pending members: ${error.message}`);

  const failed: Array<{ email: string; reason: string }> = [];
  let sent = 0;

  for (const member of pending ?? []) {
    try {
      const tickets = await getOrderTickets(member.order_id as string);
      const attachments = [];
      for (const ticket of tickets) {
        if (!ticket.pdf_path) continue;
        const { data: file, error: downloadError } = await supabase.storage.from("tickets").download(ticket.pdf_path);
        if (downloadError || !file) {
          throw new Error(`PDF ${ticket.pdf_path} konnte nicht geladen werden: ${downloadError?.message}`);
        }
        attachments.push({
          filename: ticket.pdf_path.split("/").pop() ?? ticket.pdf_path,
          content: new Uint8Array(await file.arrayBuffer()),
        });
      }

      await sendCardEmail({
        to: member.email,
        subject: applyTemplate(subjectTemplate, member),
        bodyText: applyTemplate(bodyTemplate, member),
        attachments,
      });

      await supabase.from("members").update({ cards_sent_at: new Date().toISOString() }).eq("id", member.id);
      sent++;
    } catch (sendError) {
      failed.push({ email: member.email, reason: sendError instanceof Error ? sendError.message : "Unbekannter Fehler" });
    }
  }

  return { sent, failed };
}
