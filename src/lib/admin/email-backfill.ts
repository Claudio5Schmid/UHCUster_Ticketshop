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
  /** Why the run could not finish, in words the office can act on. Absent when
   *  it did. Returned rather than thrown: a server action that throws reaches
   *  the browser as an unreadable framework error, and "the key may not read
   *  the history" is an answer, not a crash. */
  error?: string;
}

export const EMPTY_REPORT: BackfillReport = { seen: 0, known: 0, added: 0, undeliverable: 0, unmatched: [] };

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
  ordersByEmail: Map<string, string[]>,
  alreadyPaired: Map<string, number> = new Map()
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
  // Several orders can share an address - a household, or one person ordering
  // twice - and the manual send wrote to each of them separately, so there are
  // as many mails as orders and nothing in either to tell them apart. They are
  // paired off in order of sending against the orders in order of creation.
  // Which mail ends up on which of that person's orders is arbitrary, but the
  // outcome is the same for all of them: one bad address fails every one.
  for (const address of mail.to) {
    const pool = ordersByEmail.get(address);
    if (!pool) continue;
    const used = alreadyPaired.get(address) ?? 0;
    if (used >= pool.length) continue;
    alreadyPaired.set(address, used + 1);
    return { kind: "order_info", orderId: pool[used], memberId: null };
  }
  return null;
}

/** Ids in slices: every one goes into the request URL, and the whole club in a
 *  single `in()` is a URL the server refuses. */
const ID_SLICE = 100;

/** Rows per insert. Big enough that the whole club is a handful of round trips,
 *  small enough that one rejected row does not take the run with it. */
const INSERT_CHUNK = 200;

/**
 * A whole table, in pages.
 *
 * PostgREST caps an open-ended read (1000 rows by default), and both the order
 * book and the membership roster are near enough to that for a silently
 * truncated answer to start losing matches. Paging costs one extra round trip
 * and removes the question.
 */
const PAGE = 1000;

async function readAll<T>(table: string, columns: string): Promise<T[]> {
  const supabase = getSupabaseAdminClient();
  const collected: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
    const rows = (data ?? []) as T[];
    collected.push(...rows);
    if (rows.length < PAGE) return collected;
  }
}

export async function backfillDeliveryHistory(since: Date = DEFAULT_SINCE): Promise<BackfillReport> {
  const supabase = getSupabaseAdminClient();
  const mails = await listSentMails(since);

  const report: BackfillReport = { seen: mails.length, known: 0, added: 0, undeliverable: 0, unmatched: [] };
  if (mails.length === 0) return report;

  // Asked about by id rather than read whole: the answer is bounded by what
  // Resend just handed over, and PostgREST caps an open-ended read anyway.
  const known = new Set<string>();
  const allIds = mails.map((mail) => mail.id);
  for (let offset = 0; offset < allIds.length; offset += ID_SLICE) {
    const { data, error } = await supabase
      .from("email_messages")
      .select("provider_message_id")
      .in("provider_message_id", allIds.slice(offset, offset + ID_SLICE));
    if (error) throw new Error(`Failed to read the mail log: ${error.message}`);
    for (const row of data ?? []) known.add(row.provider_message_id as string);
  }

  const orderRows = await readAll<{
    id: string;
    order_number: string;
    created_at: string;
    customers: { email?: string } | { email?: string }[] | null;
  }>("orders", "id, order_number, created_at, customers(email)");
  orderRows.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const ordersByNumber = new Map<string, string>();
  const ordersByEmail = new Map<string, string[]>();
  for (const row of orderRows) {
    ordersByNumber.set(row.order_number, row.id);
    const customer = row.customers;
    const email = (Array.isArray(customer) ? customer[0]?.email : customer?.email)?.trim().toLowerCase();
    if (!email) continue;
    const pool = ordersByEmail.get(email) ?? [];
    pool.push(row.id);
    ordersByEmail.set(email, pool);
  }

  const memberRows = await readAll<{ id: string; email: string | null; order_id: string | null }>("members", "id, email, order_id");
  const membersByEmail = new Map<string, MemberMatch>();
  for (const row of memberRows) {
    if (!row.order_id) continue;
    const email = (row.email as string | null)?.trim().toLowerCase();
    if (email && !membersByEmail.has(email)) membersByEmail.set(email, { memberId: row.id, orderId: row.order_id });
  }

  // Oldest first, so that when one address was written to twice the later mail
  // is inserted later and the newest-wins rule reads them in the right order.
  const pending = mails.filter((mail) => !known.has(mail.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  report.known = mails.length - pending.length;

  const matches = new Map<string, Match>();
  // Carried across the loop so that two mails to one address take two different
  // orders rather than both landing on the same one.
  const paired = new Map<string, number>();
  for (const mail of pending) {
    const match = matchMail(mail, ordersByNumber, membersByEmail, ordersByEmail, paired);
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

  // Written in blocks rather than one at a time: the history is hundreds of
  // mails and a round trip each would outlast the request. The rows all go in
  // first, so that when the outcomes are applied afterwards the newest-wins
  // check already sees every send that happened.
  const rows = pending
    .filter((mail) => matches.has(mail.id))
    .map((mail) => {
      const match = matches.get(mail.id) as Match;
      const carriesCards = match.kind === "member_cards" || match.kind === "order_info";
      return {
        provider_message_id: mail.id,
        kind: match.kind,
        recipient: mail.to[0] ?? "",
        subject: mail.subject,
        order_id: match.orderId,
        member_id: match.memberId,
        ticket_ids: carriesCards ? (cardsByOrder.get(match.orderId) ?? []) : [],
        sent_at: mail.createdAt,
      };
    });

  const written = new Set<string>();
  for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK) {
    const chunk = rows.slice(offset, offset + INSERT_CHUNK);
    const { error: insertError } = await supabase.from("email_messages").insert(chunk);
    if (insertError) throw new Error(`Failed to record the history: ${insertError.message}`);
    for (const row of chunk) written.add(row.provider_message_id);
    report.added += chunk.length;
  }

  // Only the ones with something to say. A mail that is merely on its way is
  // already recorded as accepted by the insert above.
  for (const mail of pending) {
    if (!written.has(mail.id) || mail.status === "accepted") continue;
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
