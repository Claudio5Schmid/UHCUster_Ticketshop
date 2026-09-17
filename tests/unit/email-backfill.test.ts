import { describe, expect, it } from "vitest";
import { matchMail, type MemberMatch } from "@/lib/admin/email-backfill";

/**
 * Who a mail from Resend's history belonged to. The two mails the shop composes
 * itself carry the order number in the subject, which survives an address being
 * corrected afterwards; everything else is matched by who was written to.
 */
const ordersByNumber = new Map([["UHCU-2627-0762", "order-762"]]);
const membersByEmail = new Map<string, MemberMatch>([["ruedi@bluewin.ch", { memberId: "member-1", orderId: "order-762" }]]);
const ordersByEmail = new Map([["kundin@example.com", ["order-99"]]]);

function mail(subject: string | null, to: string[]) {
  return { id: "m1", to, subject, createdAt: "2026-09-17T18:55:00Z", status: "bounced" as const };
}

function match(subject: string | null, to: string[]) {
  return matchMail(mail(subject, to), ordersByNumber, membersByEmail, ordersByEmail);
}

describe("matchMail", () => {
  it("reads the order number out of a checkout confirmation", () => {
    expect(match("Bestellbestätigung UHC Uster - UHCU-2627-0762", ["wer@auch.immer"])).toEqual({
      kind: "order_confirmation",
      orderId: "order-762",
      memberId: null,
    });
  });

  it("recognises the internal note to the office", () => {
    expect(match("Neue Sponsorenbestellung UHCU-2627-0762 – Rechnung erstellen", ["fibu@uhcuster.ch"])).toEqual({
      kind: "order_notification",
      orderId: "order-762",
      memberId: null,
    });
  });

  it("matches a card mail to the member it was addressed to", () => {
    expect(match("Deine Saisonkarte im neuen Ticketshop des UHC Uster", ["ruedi@bluewin.ch"])).toEqual({
      kind: "member_cards",
      orderId: "order-762",
      memberId: "member-1",
    });
  });

  it("falls back to the customer on an order", () => {
    expect(match("Red Castle Club: Deine Karten", ["kundin@example.com"])).toEqual({
      kind: "order_info",
      orderId: "order-99",
      memberId: null,
    });
  });

  it("prefers the member over the order when both would match", () => {
    const both = new Map([["ruedi@bluewin.ch", ["order-someone-else"]]]);
    expect(matchMail(mail("Deine Karte", ["ruedi@bluewin.ch"]), ordersByNumber, membersByEmail, both)?.kind).toBe("member_cards");
  });

  it("pairs two mails to one address with two different orders", () => {
    const household = new Map([["familie@example.com", ["order-a", "order-b"]]]);
    const paired = new Map<string, number>();
    const first = matchMail(mail("Deine Karten", ["familie@example.com"]), ordersByNumber, membersByEmail, household, paired);
    const second = matchMail(mail("Deine Karten", ["familie@example.com"]), ordersByNumber, membersByEmail, household, paired);
    const third = matchMail(mail("Deine Karten", ["familie@example.com"]), ordersByNumber, membersByEmail, household, paired);
    expect(first?.orderId).toBe("order-a");
    expect(second?.orderId).toBe("order-b");
    // More mails than orders: the extra one is reported rather than doubled up.
    expect(third).toBeNull();
  });

  it("matches nobody rather than guessing", () => {
    expect(match("Irgendwas", ["fremde@example.com"])).toBeNull();
    expect(match("Bestellbestätigung UHC Uster - UHCU-2627-9999", ["wer@auch.immer"])).toBeNull();
    expect(match(null, [])).toBeNull();
  });
});
