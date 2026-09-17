import { cardMailHtml, cardMailText, type CardMailInput } from "@/lib/email/card-mail";

/**
 * The member card e-mail: the generic card mail (card-mail.ts) under the
 * "Mitgliederkarte" heading. The frame moved out of here when the orders tab
 * got the same kind of send (D71/O13); the two mails look alike on purpose.
 */
export type MemberCardsEmailInput = Omit<CardMailInput, "eyebrow">;

export function memberCardsHtml(input: MemberCardsEmailInput): string {
  return cardMailHtml({ ...input, eyebrow: "Mitgliederkarte" });
}

export function memberCardsText(input: MemberCardsEmailInput): string {
  return cardMailText({ ...input, eyebrow: "Mitgliederkarte" });
}
