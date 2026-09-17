import { getSupabaseAdminClient } from "@/lib/supabase";
import { listSentMails, type SentMailRecord } from "@/lib/email/history";
import { applyDeliveryEvent } from "@/lib/email/delivery";
import type { EmailKind } from "@/lib/email/delivery";

/**
 * Writes the mails that went out before the shop kept a log, so their outcome
 * can land where the office reads it.
 *
 * The delivery log starts the moment it was deployed (D88). The club's first
 * card run went out an hour earlier, which means Resend's bounces for it reach
 * the webhook, match nothing, and are dropped - and a member whose card never
 * arrived keeps reading as "vollständig versendet". Resend still has the
 * history and the last thing that happened to each mail, so the rows can be
 * written after the fact and the ordinary rule then applies to them.
 *
 * Matching is by what the shop itself put in the subject where it can be, and
 * by recipient address otherwise. A mail nobody here can be matched to is
 * counted and left alone rather than guessed at: a wrong match would mark the
 * wrong person's card unsent.
 */

/** Only mails the shop could have sent - the club's own history, not the years
 *  of whatever else has used this Resend account. */
const DEFAULT_SINCE = new Date("2026-09-01T00:00:00Z");

export interface BackfillReport {
  /** Mails Resend had on file in the window. */
  seen: number;
  /** Already in the log, so nothing to do. */
  known: number;
  /** Rows written now. */
  added: number;
  /** Of those, the ones that turn out not to have arrived. */
  undeliverable: number;
  /** Mails that match nobody here, with the addresses, so they can be looked at. */
  unmatched: string[];
}

export interface MemberMatch {
  memberId: string;
  orderId: string;
}

const CONFIRMATION_PREFIX = "Bestellbestätigung UHC Uster - ";
const INTERNAL_SUBJECT = /^Neue \S+ (\S+) – Rechnung erstellen$/;

export interface Match {
  kind: EmailKind;
  orderId: string;
  memberId: string | null;
}

/**
 * Who a mail belonged to.
 *
 * The two mails the shop composes itself carry the order number in the subject,
 * which is a far better key than an address that may since have been corrected.
 * Everything else is a send to a person: a member if the address is one, else
 * the customer on an order.
 */
export function matchMail(
  mail: SentMailRecord,
  ordersByNumber: Map<string, string>,
  membersByEmail: Map<string, MemberMatch>,
  ordersByEmail: Map<string, string>
): Match | null {
  const subject = mail.subject ?? "";

  if (subject.startsWith(CONFIRMATION_PREFIX)) {
    const orderId = ordersByNumber.get(subject.slice(CONFIRMATION_PREFIX.length).trim());
    return orderId ? { kind: "order_confirmation", orderId, memberId: null } : null;
  }

  const internal = INTERNAL_SUBJECT.exec(subject);
  if (internal) {
    const orderId = ordersByNumber.get(internal[1]);
    return orderId ? { kind: "order_notification", orderId, memberId: null } : null;
  }

  for (const address of mail.to) {
    const member = membersByEmail.get(address);
    if (member) return { kind: "member_cards", orderId: member.orderId, memberId: member.memberId };
  }
  for (const address of mail.to) {
    const orderId = ordersByEmail.get(address);
    if (orderId) return { kind: "order_info", orderId, memberId: null };
  }
  return null;
}

/** Ids in slices: every one goes into the request URL, and the whole club in a
 *  single `in()` is a URL the server refuses. */
const ID_SLICE = 100;

export async function backfillDeliveryHistory(since: Date = DEFAULT_SINCE): Promise<BackfillReport> {
  const supabase = getSupabaseAdminClient();
  const mails = await listSentMails(since);

  const report: BackfillReport = { seen: mails.length, known: 0, added: 0, undeliverable: 0, unmatched: [] };
  if (mails.length === 0) return report;

  const { data: existing, error: existingError } = await supabase.from("email_messages").select("provider_message_id");
  if (existingError) throw new Error(`Failed to read the mail log: ${existingError.message}`);
  const known = new Set((existing ?? []).map((row) => row.provider_message_id as string));

  const { data: orderRows, error: orderError } = await supabase.from("orders").select("id, order_number, customers(email)");
  if (orderError) throw new Error(`Failed to read orders: ${orderError.message}`);
  const ordersByNumber = new Map<string, string>();
  const ordersByEmail = new Map<string, string>();
  for (const row of orderRows ?? []) {
    ordersByNumber.set(row.order_number as string, row.id as string);
    const customer = row.customers as { email?: string } | { email?: string }[] | null;
    const email = (Array.isArray(customer) ? customer[0]?.email : customer?.email)?.trim().toLowerCase();
    // First one wins: a customer with several orders is matched by subject above
    // anyway, and this fallback only has to find someone plausible.
    if (email && !ordersByEmail.has(email)) ordersByEmail.set(email, row.id as string);
  }

  const { data: memberRows, error: memberError } = await supabase.from("members").select("id, email, order_id").not("order_id", "is", null);
  if (memberError) throw new Error(`Failed to read members: ${memberError.message}`);
  const membersByEmail = new Map<string, MemberMatch>();
  for (const row of memberRows ?? []) {
    const email = (row.email as string | null)?.trim().toLowerCase();
    if (email && !membersByEmail.has(email)) membersByEmail.set(email, { memberId: row.id as string, orderId: row.order_id as string });
  }

  // Oldest first, so that when one address was written to twice the later mail
  // is inserted later and the newest-wins rule reads them in the right order.
  const pending = mails.filter((mail) => !known.has(mail.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  report.known = mails.length - pending.length;

  const matches = new Map<string, Match>();
  for (const mail of pending) {
    const match = matchMail(mail, ordersByNumber, membersByEmail, ordersByEmail);
    if (match) matches.set(mail.id, match);
    else report.unmatched.push(mail.to[0] ?? "(kein Empfänger)");
  }

  // The cards each order had marked as sent - what a mail of that order carried,
  // and so what a bounce has to reopen.
  const orderIds = [...new Set([...matches.values()].map((match) => match.orderId))];
  const cardsByOrder = new Map<string, string[]>();
  for (let offset = 0; offset < orderIds.length; offset += ID_SLICE) {
    const { data: tickets, error: ticketError } = await supabase
      .from("tickets")
      .select("id, order_id")
      .not("card_sent_at", "is", null)
      .in("order_id", orderIds.slice(offset, offset + ID_SLICE));
    if (ticketError) throw new Error(`Failed to read cards: ${ticketError.message}`);
    for (const ticket of tickets ?? []) {
      const list = cardsByOrder.get(ticket.order_id as string) ?? [];
      list.push(ticket.id as string);
      cardsByOrder.set(ticket.order_id as string, list);
    }
  }

  for (const mail of pending) {
    const match = matches.get(mail.id);
    if (!match) continue;

    const carriesCards = match.kind === "member_cards" || match.kind === "order_info";
    const { error: insertError } = await supabase.from("email_messages").insert({
      provider_message_id: mail.id,
      kind: match.kind,
      recipient: mail.to[0] ?? "",
      subject: mail.subject,
      order_id: match.orderId,
      member_id: match.memberId,
      ticket_ids: carriesCards ? (cardsByOrder.get(match.orderId) ?? []) : [],
      sent_at: mail.createdAt,
    });
    if (insertError) {
      // A row someone else wrote in the meantime is not a failure worth stopping
      // the run for - the rest of the history still wants writing.
      console.error(`[email] could not record ${mail.id}:`, insertError.message);
      continue;
    }
    report.added += 1;

    if (mail.status === "accepted") continue;
    await applyDeliveryEvent({
      messageId: mail.id,
      status: mail.status,
      detail: "Nachgetragen aus der Resend-Historie",
      occurredAt: mail.createdAt,
    });
    if (mail.status === "bounced" || mail.status === "complained" || mail.status === "failed") report.undeliverable += 1;
  }

  return report;
}
