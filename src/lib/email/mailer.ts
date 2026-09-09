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

/** Returns true if the message was accepted, false if the address was skipped as
 * structurally undeliverable (see isUndeliverableAddress). Throws only on a real
 * send failure.
 *
 * Note that acceptance says nothing about delivery: if the From domain can't pass
 * SPF/DKIM alignment for the sending path, receivers drop the message silently after
 * the provider has already reported success. MAIL_FROM_EMAIL therefore has to be an
 * address on a domain verified in Resend, with the DKIM records Resend issues present
 * in that domain's DNS - never a free-mail address like gmail.com, whose DNS the club
 * cannot authorise anyone in.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const fromEmail = process.env.MAIL_FROM_EMAIL;
  if (!fromEmail) {
    throw new Error("MAIL_FROM_EMAIL must be set to send email.");
  }

  // Lets the From be a no-reply address on the club's own domain while replies still
  // reach a mailbox someone reads - the confirmation invites the customer to reply.
  const replyTo = process.env.MAIL_REPLY_TO?.trim() || undefined;

  if (isUndeliverableAddress(input.to)) {
    console.warn(`[email] Skipped ${input.subject} to a reserved-TLD address - would hard-bounce.`);
    return false;
  }

  const attachments = (input.attachments ?? []).map((attachment) => ({
    filename: attachment.filename,
    content: Buffer.from(attachment.content),
    contentType: "application/pdf",
  }));

  const { error } = await getClient().emails.send({
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

  return true;
}

export interface SendCardEmailInput {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments: EmailAttachment[];
}

/**
 * Returns false when the address was skipped as structurally undeliverable, the
 * same as sendEmail. This used to return void, which meant a member on a
 * reserved-TLD address was recorded as having received their cards when nothing
 * had been sent - harmless while sending was tracked per member and only test
 * data ever hit it, but the per-card status now shown in the admin has to be
 * true.
 */
export async function sendCardEmail(input: SendCardEmailInput): Promise<boolean> {
  return sendEmail(input);
}
