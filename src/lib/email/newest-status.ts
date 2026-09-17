import type { DeliveryStatus, EmailKind } from "@/lib/email/delivery";

/** The mails that say something about the customer. The note to the office and a
 *  test mail are not addressed to them, so neither speaks for their status. */
const CUSTOMER_MAIL_KINDS: ReadonlySet<string> = new Set<EmailKind>(["order_info", "member_cards", "order_confirmation"]);

export interface SentMail {
  kind: string;
  status: string;
  sent_at: string;
}

/**
 * The status of the newest mail that actually went to the customer.
 *
 * Every resend gets its own id at the provider, so a customer written to three
 * times has three rows here, each with its own outcome - and the outcomes come
 * back late and out of order, a hard bounce sometimes a day later. The only
 * answer that stays true is the newest send's, which is why the shop reads that
 * one and nothing else.
 *
 * The database follows the same rule from the other side: record_email_status
 * refuses to carry an outcome into the order once a newer mail has gone out.
 *
 * Returns null when nothing has been sent, or when everything was sent before
 * the mail log existed - the caller then falls back to what the send recorded.
 */
export function newestDeliveryStatus(mails: readonly SentMail[] | null | undefined): DeliveryStatus | null {
  let newest: SentMail | null = null;
  for (const mail of mails ?? []) {
    if (!CUSTOMER_MAIL_KINDS.has(mail.kind)) continue;
    // ISO-8601 from Postgres, so string order is time order.
    if (!newest || mail.sent_at > newest.sent_at) newest = mail;
  }
  return (newest?.status as DeliveryStatus | undefined) ?? null;
}
