import { getSupabaseServerClient } from "@/lib/supabase-server";
import { issueTicketsForOrder, addMemberTickets } from "@/lib/tickets/issue";
import { getOrderTickets, type OrderTicket } from "@/lib/admin/tickets";
import { sendCardEmail } from "@/lib/email/ses";
import { CURRENT_SEASON } from "@/lib/season";
import { parseMemberCsvRows, type CsvColumnMapping } from "@/lib/csv/memberCsv";
import {
  EMPTY_COUNTS,
  countCards,
  isLiveTicket,
  applyMemberFilters,
  type CountableTicket,
  type Member,
  type MemberFilters,
} from "@/lib/admin/member-state";

export type { Member, MemberCardCounts, MemberSendState, MemberFilters } from "@/lib/admin/member-state";
export { memberSendState, applyMemberFilters, countCards } from "@/lib/admin/member-state";

export interface MemberInput {
  vorname: string;
  nachname: string;
  email: string;
  kategorie: string | null;
  personalCardCount: number;
  transferableCardCount: number;
}

interface MemberRow extends Omit<Member, "order_number" | "cards"> {
  orders: { order_number: string } | null;
}

/**
 * Every member with the state of their cards attached.
 *
 * Counted from `tickets` rather than from the members row, because
 * mitgliederkarte / transferable_code_count only record what was asked for when
 * the member was created - after a card is added, deactivated or regenerated
 * they no longer describe what the member actually holds.
 *
 * Two queries and an aggregation in Node rather than a view: a few hundred
 * members is a few thousand ticket rows, which is nothing, and keeping the
 * counting rules in one readable place beats spreading them across SQL.
 */
export async function getAllMembers(filters: MemberFilters = {}): Promise<Member[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("members")
    .select("*, orders(order_number)")
    .order("nachname", { ascending: true });
  if (error) throw new Error(`Failed to load members: ${error.message}`);

  const rows = (data ?? []) as MemberRow[];
  const orderIds = rows.map((row) => row.order_id).filter((id): id is string => Boolean(id));

  const cardsByOrder = new Map<string, ReturnType<typeof countCards>>();
  if (orderIds.length > 0) {
    const { data: tickets, error: ticketsError } = await supabase
      .from("tickets")
      .select("order_id, status, transferable, card_sent_at")
      .in("order_id", orderIds);
    if (ticketsError) throw new Error(`Failed to load member cards: ${ticketsError.message}`);

    const grouped = new Map<string, CountableTicket[]>();
    for (const ticket of tickets ?? []) {
      const list = grouped.get(ticket.order_id) ?? [];
      list.push(ticket);
      grouped.set(ticket.order_id, list);
    }
    for (const [orderId, list] of grouped) {
      cardsByOrder.set(orderId, countCards(list));
    }
  }

  const members = rows.map(({ orders, ...member }) => ({
    ...member,
    order_number: orders?.order_number ?? null,
    cards: (member.order_id && cardsByOrder.get(member.order_id)) || { ...EMPTY_COUNTS },
  }));

  return applyMemberFilters(members, filters);
}

/** The categories actually in use, for the filter bar's dropdown. */
export async function getMemberKategorien(): Promise<string[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("members").select("kategorie").not("kategorie", "is", null);
  if (error) throw new Error(`Failed to load categories: ${error.message}`);
  const values = new Set((data ?? []).map((row) => (row.kategorie ?? "").trim()).filter(Boolean));
  return [...values].sort((a, b) => a.localeCompare(b, "de-CH"));
}

export interface MemberDetail {
  member: Member;
  tickets: OrderTicket[];
}

export async function getMemberDetail(memberId: string): Promise<MemberDetail | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("members").select("*, orders(order_number)").eq("id", memberId).maybeSingle();
  if (error) throw new Error(`Failed to load member: ${error.message}`);
  if (!data) return null;

  const { orders, ...row } = data as MemberRow;
  const tickets = row.order_id ? await getOrderTickets(row.order_id) : [];

  return {
    member: { ...row, order_number: orders?.order_number ?? null, cards: countCards(tickets) },
    tickets,
  };
}

export async function updateMemberKategorie(memberId: string, kategorie: string | null): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("members").update({ kategorie }).eq("id", memberId);
  if (error) throw new Error(error.message);
}

/**
 * Removes roster rows only - a member's order and any already-issued tickets
 * (if cards were generated) are untouched, same as everywhere else in this
 * schema treats orders as permanent. Mainly for cleaning up test entries.
 */
export async function deleteMembers(memberIds: string[]): Promise<void> {
  if (memberIds.length === 0) return;
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("members").delete().in("id", memberIds);
  if (error) throw new Error(`Failed to delete members: ${error.message}`);
}

/**
 * Inserts the roster row, and - if this member is actually getting cards -
 * creates the order and issues tickets through the exact same pipeline a real
 * shop purchase uses (src/lib/tickets/issue.ts), so PDFs, tokens, and Storage
 * all work identically. Cards are generated immediately; the email itself is a
 * separate, later, explicitly-confirmed step (sendMemberCards).
 */
export async function createMemberAndIssueCards(input: MemberInput): Promise<Member> {
  const supabase = await getSupabaseServerClient();
  const fullName = `${input.vorname} ${input.nachname}`.trim();
  const personal = Math.max(0, Math.trunc(input.personalCardCount));
  const transferable = Math.max(0, Math.trunc(input.transferableCardCount));

  const { data: member, error: memberError } = await supabase
    .from("members")
    .insert({
      vorname: input.vorname,
      nachname: input.nachname,
      email: input.email,
      kategorie: input.kategorie,
      // Kept in step with personal_card_count so anything still reading the old
      // boolean sees the truth until it is dropped.
      mitgliederkarte: personal > 0,
      personal_card_count: personal,
      transferable_code_count: transferable,
    })
    .select()
    .single();

  if (memberError || !member) {
    throw new Error(memberError?.message ?? "Failed to create member");
  }

  if (personal + transferable === 0) {
    return { ...(member as Omit<Member, "cards">), cards: { ...EMPTY_COUNTS } };
  }

  const orderId = await createOrderForMember(fullName, input.email, personal, transferable);

  const { data: updatedMember, error: updateError } = await supabase
    .from("members")
    .update({ order_id: orderId })
    .eq("id", member.id)
    .select()
    .single();

  if (updateError || !updatedMember) {
    throw new Error(updateError?.message ?? "Failed to link member to their order");
  }

  const tickets = await getOrderTickets(orderId);
  return { ...(updatedMember as Omit<Member, "cards">), cards: countCards(tickets) };
}

async function createOrderForMember(
  fullName: string,
  email: string,
  personal: number,
  transferable: number
): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const { data: orderId, error } = await supabase.rpc("create_member_order", {
    p_customer_name: fullName,
    p_email: email,
    p_personal_count: personal,
    p_transferable_count: transferable,
    p_season: CURRENT_SEASON,
  });

  if (error || !orderId) {
    throw new Error(error?.message ?? "Failed to create member order");
  }

  await issueTicketsForOrder(orderId);
  return orderId;
}

/**
 * Adds cards to a member who already has some - the correction path for a typo
 * in the member list, or someone who turns out to need one more code.
 *
 * A member created without any cards has no order yet, so the first addition
 * creates one; from then on the cards are appended to it, which is what keeps
 * the running numbers continuous.
 */
export async function addCardsToMember(
  memberId: string,
  counts: { personal: number; transferable: number }
): Promise<void> {
  const personal = Math.max(0, Math.trunc(counts.personal));
  const transferable = Math.max(0, Math.trunc(counts.transferable));
  if (personal + transferable === 0) return;

  const supabase = await getSupabaseServerClient();
  const { data: member, error } = await supabase
    .from("members")
    .select("id, vorname, nachname, email, order_id, personal_card_count, transferable_code_count")
    .eq("id", memberId)
    .single();
  if (error || !member) throw new Error(error?.message ?? "Mitglied nicht gefunden.");

  if (!member.order_id) {
    const fullName = `${member.vorname} ${member.nachname}`.trim();
    const orderId = await createOrderForMember(fullName, member.email, personal, transferable);
    const { error: linkError } = await supabase.from("members").update({ order_id: orderId }).eq("id", memberId);
    if (linkError) throw new Error(linkError.message);
  } else {
    await addMemberTickets(member.order_id, { personal, transferable });
  }

  // The two count columns record what this member was asked to receive, so they
  // move with an addition. The cards themselves remain the source of truth.
  const { error: countError } = await supabase
    .from("members")
    .update({
      personal_card_count: member.personal_card_count + personal,
      transferable_code_count: member.transferable_code_count + transferable,
      mitgliederkarte: member.personal_card_count + personal > 0,
    })
    .eq("id", memberId);
  if (countError) throw new Error(countError.message);
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
        // The CSV's "Mitgliederkarte ja/nein" column is a yes/no by nature -
        // one personal card or none.
        personalCardCount: rows[i].mitgliederkarte ? 1 : 0,
        transferableCardCount: rows[i].transferableCodeCount,
      });
      imported++;
    } catch (error) {
      failed.push({ row: i + 2, reason: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  }

  return { imported, failed };
}

export interface SendCardsResult {
  sent: number;
  cards: number;
  failed: Array<{ email: string; reason: string }>;
}

function applyTemplate(template: string, member: Pick<Member, "vorname" | "nachname">): string {
  return template.replaceAll("{{vorname}}", member.vorname).replaceAll("{{nachname}}", member.nachname);
}

/**
 * The one place this whole system sends email.
 *
 * Sending is driven by an explicit selection - there is deliberately no "send to
 * everyone" path - and each member gets only the cards that have not gone out
 * yet. A member whose cards have all been sent is skipped rather than mailed an
 * empty message, so repeating a partially failed send is safe.
 */
export async function sendMemberCards(
  subjectTemplate: string,
  bodyTemplate: string,
  memberIds: string[]
): Promise<SendCardsResult> {
  if (memberIds.length === 0) return { sent: 0, cards: 0, failed: [] };

  const supabase = await getSupabaseServerClient();
  const { data: members, error } = await supabase
    .from("members")
    .select("id, vorname, nachname, email, order_id")
    .in("id", memberIds)
    .not("order_id", "is", null);

  if (error) throw new Error(`Failed to load members: ${error.message}`);

  const failed: Array<{ email: string; reason: string }> = [];
  let sent = 0;
  let cards = 0;

  for (const member of members ?? []) {
    try {
      const tickets = await getOrderTickets(member.order_id as string);
      const pending = tickets.filter((ticket) => isLiveTicket(ticket) && !ticket.card_sent_at);
      if (pending.length === 0) continue;

      const missing = pending.filter((ticket) => !ticket.pdf_path);
      if (missing.length > 0) {
        // Better a visible failure than an e-mail that silently arrives one card
        // short - the member would have no way of knowing something is missing.
        throw new Error(`${missing.length} Karte(n) haben keine PDF hinterlegt.`);
      }

      const attachments = [];
      for (const ticket of pending) {
        const path = ticket.pdf_path as string;
        const { data: file, error: downloadError } = await supabase.storage.from("tickets").download(path);
        if (downloadError || !file) {
          throw new Error(`PDF ${path} konnte nicht geladen werden: ${downloadError?.message}`);
        }
        attachments.push({
          filename: path.split("/").pop() ?? path,
          content: new Uint8Array(await file.arrayBuffer()),
        });
      }

      const delivered = await sendCardEmail({
        to: member.email,
        subject: applyTemplate(subjectTemplate, member),
        bodyText: applyTemplate(bodyTemplate, member),
        attachments,
      });

      if (!delivered) {
        // A reserved-TLD address can never receive anything, so the cards stay
        // open. Reported rather than skipped quietly: an admin who selected this
        // member is owed the reason their cards did not go out.
        throw new Error("Adresse ist nicht zustellbar (reservierte Domain) - es wurde nichts versendet.");
      }

      const { error: markError } = await supabase.rpc("mark_tickets_sent", {
        p_ticket_ids: pending.map((ticket) => ticket.id),
      });
      if (markError) throw new Error(markError.message);

      // Deprecated, still written so a rollback of this code lands on data it
      // understands. tickets.card_sent_at is what anything reads.
      await supabase.from("members").update({ cards_sent_at: new Date().toISOString() }).eq("id", member.id);

      // Emailing the cards is the handover for a member order - counts as
      // "files handed over" automatically, same as handing them over in person.
      // Every card that was open has just been marked sent, so this is the point
      // where the member has everything. Best-effort: the email already went
      // out, so a failure here must not turn a successful send into a failure.
      try {
        await supabase.rpc("set_files_handed_over", { p_order_id: member.order_id, p_handed_over: true });
      } catch {
        // non-fatal - the admin can still set this manually from the order page
      }

      sent++;
      cards += pending.length;
    } catch (sendError) {
      failed.push({ email: member.email, reason: sendError instanceof Error ? sendError.message : "Unbekannter Fehler" });
    }
  }

  return { sent, cards, failed };
}
