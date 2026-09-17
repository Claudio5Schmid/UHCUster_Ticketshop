import { Resend } from "resend";

/**
 * Outbound email. The project's original rule was "no email, ever" (D38); it now has
 * exactly two documented exceptions, and no others: membership card PDFs sent to club
 * members (D40), and the order confirmation a customer gets right after checkout (D49).
 * Nothing else - no admin notifications, no marketing, no reminders.
 *
 * Named for the job rather than for Resend on purpose. This is the club's second
 * provider (Amazon SES until 2026-09-09), and the two call sites had to be edited for
 * that switch only because the module was named after the first one.
 */
function getClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY must be set to send email.");
  }
  return new Resend(apiKey);
}

export interface EmailAttachment {
  filename: string;
  content: Uint8Array;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments?: EmailAttachment[];
}

/**
 * TLDs reserved by RFC 2606/6761 - they can never resolve, so anything addressed to
 * one is guaranteed to hard-bounce. The Playwright suite deliberately creates orders
 * with @playwright-test.invalid customers on the production project, and providers
 * suspend accounts over sustained bounce rates, so those must never be handed over at
 * all. That was true of SES and is just as true of Resend.
 */
const UNDELIVERABLE_TLDS = [".invalid", ".test", ".example", ".localhost"];

export function isUndeliverableAddress(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return UNDELIVERABLE_TLDS.some((tld) => normalized.endsWith(tld));
}

export interface SendEmailResult {
  /** Whether the provider took the message. */
  accepted: boolean;
  /**
   * The provider's id for it - what a later delivery event is tied to. Null when
   * the address was skipped, and (defensively) when the provider answers without
   * one; a message with no id simply cannot be followed up.
   */
  messageId: string | null;
}

/** Hands the message over and reports whether it was accepted, along with the
 * provider's id for it. False means the address was skipped as structurally
 * undeliverable (see isUndeliverableAddress); a real send failure throws.
 *
 * Acceptance says nothing about delivery. The provider answers immediately and
 * finds out whether the message actually arrived seconds or hours later, which is
 * what /api/webhooks/resend and email_messages exist for: the id returned here is
 * what a bounce is later matched against, so "versendet" in the admin can go back
 * to open when the message did not arrive.
 *
 * MAIL_FROM_EMAIL has to be an address on a domain verified in Resend, with the
 * DKIM records Resend issues present in that domain's DNS - never a free-mail
 * address like gmail.com, whose DNS the club cannot authorise anyone in: mail that
 * cannot pass SPF/DKIM alignment is dropped by receivers after the provider has
 * already reported success.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const fromEmail = process.env.MAIL_FROM_EMAIL;
  if (!fromEmail) {
    throw new Error("MAIL_FROM_EMAIL must be set to send email.");
  }

  // Lets the From be a no-reply address on the club's own domain while replies still
  // reach a mailbox someone reads - the confirmation invites the customer to reply.
  const replyTo = process.env.MAIL_REPLY_TO?.trim() || undefined;

  if (isUndeliverableAddress(input.to)) {
    console.warn(`[email] Skipped ${input.subject} to a reserved-TLD address - would hard-bounce.`);
    return { accepted: false, messageId: null };
  }

  const attachments = (input.attachments ?? []).map((attachment) => ({
    filename: attachment.filename,
    content: Buffer.from(attachment.content),
    contentType: "application/pdf",
  }));

  const { data, error } = await getClient().emails.send({
    from: fromEmail,
    to: input.to,
    ...(replyTo ? { replyTo } : {}),
    subject: input.subject,
    text: input.bodyText,
    ...(input.bodyHtml ? { html: input.bodyHtml } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
  });

  // Resend reports a refused send in its response instead of throwing - the opposite
  // of the nodemailer/SES transport this replaced, whose sendMail rejected. Ignoring
  // `error` would turn every rejection into a reported success, and sendPendingCards
  // in src/lib/admin/members.ts would stamp cards as sent that never left the building.
  if (error) {
    throw new Error(`E-Mail konnte nicht versendet werden (${error.name}): ${error.message}`);
  }

  return { accepted: true, messageId: data?.id ?? null };
}

export interface SendCardEmailInput {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments: EmailAttachment[];
}

/**
 * Same result as sendEmail, including the provider's message id. It used to
 * return void, which meant a member on a reserved-TLD address was recorded as
 * having received their cards when nothing had been sent - harmless while
 * sending was tracked per member and only test data ever hit it, but the
 * per-card status now shown in the admin has to be true.
 */
export async function sendCardEmail(input: SendCardEmailInput): Promise<SendEmailResult> {
  return sendEmail(input);
}
