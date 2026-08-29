import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";

/**
 * Outbound email. The project's original rule was "no email, ever" (D38); it now has
 * exactly two documented exceptions, and no others: membership card PDFs sent to club
 * members (D40), and the order confirmation a customer gets right after checkout (D49).
 * Nothing else - no admin notifications, no marketing, no reminders.
 *
 * nodemailer's built-in SES transport targets the SESv2 API specifically
 * (it builds a raw MIME message and sends it via SESv2's SendEmailCommand,
 * whose request shape - FromEmailAddress/Destination/Content.Raw.Data - only
 * matches @aws-sdk/client-sesv2, not the older @aws-sdk/client-ses v1 SDK).
 * @types/nodemailer doesn't model the SES transport option, hence the assertion
 * on the options object below - the shape itself ({ SES: { sesClient,
 * SendEmailCommand } }) is exactly what nodemailer's ses-transport reads at
 * runtime, confirmed against its source.
 */
function getTransporter() {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error("AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY must be set to send email.");
  }

  const sesClient = new SESv2Client({ region, credentials: { accessKeyId, secretAccessKey } });
  return nodemailer.createTransport({ SES: { sesClient, SendEmailCommand } } as unknown as nodemailer.TransportOptions);
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
 * with @playwright-test.invalid customers on the production project, and AWS suspends
 * accounts over sustained bounce rates, so those must never reach SES at all.
 */
const UNDELIVERABLE_TLDS = [".invalid", ".test", ".example", ".localhost"];

export function isUndeliverableAddress(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return UNDELIVERABLE_TLDS.some((tld) => normalized.endsWith(tld));
}

/** Returns true if the message was handed to SES, false if the address was skipped
 * as structurally undeliverable (see isUndeliverableAddress). Throws only on a real
 * send failure. */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const fromEmail = process.env.SES_FROM_EMAIL;
  if (!fromEmail) {
    throw new Error("SES_FROM_EMAIL must be set to send email.");
  }

  if (isUndeliverableAddress(input.to)) {
    console.warn(`[email] Skipped ${input.subject} to a reserved-TLD address - would hard-bounce.`);
    return false;
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: fromEmail,
    to: input.to,
    subject: input.subject,
    text: input.bodyText,
    ...(input.bodyHtml ? { html: input.bodyHtml } : {}),
    attachments: (input.attachments ?? []).map((attachment) => ({
      filename: attachment.filename,
      content: Buffer.from(attachment.content),
      contentType: "application/pdf",
    })),
  });

  return true;
}

export interface SendCardEmailInput {
  to: string;
  subject: string;
  bodyText: string;
  attachments: EmailAttachment[];
}

export async function sendCardEmail(input: SendCardEmailInput): Promise<void> {
  await sendEmail(input);
}
