import type { OrderTicket } from "@/lib/admin/tickets";

/**
 * The shapes and rules describing a member's cards, kept apart from
 * members.ts on purpose: that module reaches for Supabase, the PDF renderer and
 * the mail transport, and a client component importing one function from it
 * would drag all of them into the browser bundle. Everything here is pure, so
 * both sides can share it.
 */

/** Live counts from the member's cards, not from what was asked for at creation. */
export interface MemberCardCounts {
  /** Cards whose QR still works. */
  active: number;
  /** Of those, already e-mailed. */
  sent: number;
  /** Of those, still to send - what the send button counts. */
  open: number;
  personal: number;
  transferable: number;
  /** Deactivated after a loss or a mistake. Kept visible, never deleted. */
  inactive: number;
}

export type MemberSendState = "ohne" | "offen" | "teilweise" | "vollstaendig";

export interface Member {
  id: string;
  /** The club's own member number, from the import CSV. Null for members created
   *  before it existed. The key an import matches on - see members.ts. */
  external_id: string | null;
  vorname: string;
  nachname: string;
  email: string;
  kategorie: string | null;
  mitgliederkarte: boolean;
  personal_card_count: number;
  transferable_code_count: number;
  order_id: string | null;
  order_number?: string | null;
  cards_sent_at: string | null;
  created_at: string;
  cards: MemberCardCounts;
}

export const EMPTY_COUNTS: MemberCardCounts = {
  active: 0,
  sent: 0,
  open: 0,
  personal: 0,
  transferable: 0,
  inactive: 0,
};

/** The three fields the counting rules actually look at. */
export type CountableTicket = Pick<OrderTicket, "status" | "transferable" | "card_sent_at">;

export function isLiveTicket(ticket: CountableTicket): boolean {
  return ticket.status === "gueltig" || ticket.status === "eingeloest";
}

export function countCards(tickets: CountableTicket[]): MemberCardCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const ticket of tickets) {
    if (ticket.status === "ersetzt") continue; // superseded; its replacement is counted instead
    if (ticket.status === "storniert") {
      counts.inactive++;
      continue;
    }
    counts.active++;
    if (ticket.transferable) counts.transferable++;
    else counts.personal++;
    if (ticket.card_sent_at) counts.sent++;
    else counts.open++;
  }
  return counts;
}

export function memberSendState(member: Member): MemberSendState {
  if (!member.order_id || member.cards.active === 0) return "ohne";
  if (member.cards.open === 0) return "vollstaendig";
  if (member.cards.sent === 0) return "offen";
  return "teilweise";
}

export interface MemberFilters {
  search?: string;
  kategorie?: string;
  versand?: MemberSendState;
}

/**
 * Applied in Node rather than in SQL because the send state is derived from the
 * card counts - one place decides what "teilweise versendet" means, and the
 * search and category filters sit next to it so the whole bar behaves alike.
 */
export function applyMemberFilters(members: Member[], filters: MemberFilters): Member[] {
  const search = filters.search?.trim().toLowerCase();

  return members.filter((member) => {
    if (search) {
      const haystack = `${member.vorname} ${member.nachname} ${member.email} ${member.kategorie ?? ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (filters.kategorie && (member.kategorie ?? "") !== filters.kategorie) return false;
    if (filters.versand && memberSendState(member) !== filters.versand) return false;
    return true;
  });
}

export interface CardReconciliation {
  /** Ticket ids to void, in the order they should go. */
  toVoid: string[];
  toAdd: { personal: number; transferable: number };
}

/**
 * Works out how to bring a member's live cards to the counts an import asks for,
 * without touching the ones that are already right - a QR code sitting in
 * somebody's inbox keeps working, which replacing the whole set on every import
 * would not allow.
 *
 * Which surplus card goes is not arbitrary: the least committed one. A card
 * nobody has received yet costs nothing to withdraw, a delivered one stops
 * working in somebody's inbox, and one that has already been through the door
 * belongs to a person who may be standing in the hall - so cards are kept in that
 * order and voided from the other end.
 *
 * Pure so that ordering can be tested without a database, which is how the first
 * version was caught keeping the unsent cards and voiding the delivered ones.
 * members.ts does the voiding itself.
 */
export function planCardReconciliation(
  live: Array<{ id: string; transferable: boolean; status: string; card_sent_at: string | null }>,
  target: { personal: number; transferable: number }
): CardReconciliation {
  const rank = (ticket: { status: string; card_sent_at: string | null }) =>
    ticket.status === "eingeloest" ? 2 : ticket.card_sent_at ? 1 : 0;

  const toVoid: string[] = [];
  for (const [transferable, wanted] of [
    [false, Math.max(0, Math.trunc(target.personal))],
    [true, Math.max(0, Math.trunc(target.transferable))],
  ] as Array<[boolean, number]>) {
    // Descending: the most committed card sorts first and is kept, the surplus is
    // taken from the tail where the never-sent ones are.
    const held = live.filter((ticket) => ticket.transferable === transferable).sort((a, b) => rank(b) - rank(a));
    for (const ticket of held.slice(wanted)) toVoid.push(ticket.id);
  }

  return {
    toVoid,
    toAdd: {
      personal: Math.max(0, Math.trunc(target.personal) - live.filter((t) => !t.transferable).length),
      transferable: Math.max(0, Math.trunc(target.transferable) - live.filter((t) => t.transferable).length),
    },
  };
}

