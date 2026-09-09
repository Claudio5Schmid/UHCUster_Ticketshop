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
