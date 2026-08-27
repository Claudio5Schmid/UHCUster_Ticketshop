import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";

/**
 * The one deliberate, scoped exception to this project's original "no email,
 * ever" rule (docs/DECISIONS.md) - used only for sending club members their
 * membership card PDF(s). Nothing else in the system sends email: order
 * confirmations, admin notifications, etc. all still work exactly as before,
 * entirely without it.
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
    throw new Error("AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY must be set to send member card emails.");
  }

  const sesClient = new SESv2Client({ region, credentials: { accessKeyId, secretAccessKey } });
  return nodemailer.createTransport({ SES: { sesClient, SendEmailCommand } } as unknown as nodemailer.TransportOptions);
}

export interface EmailAttachment {
  filename: string;
  content: Uint8Array;
}

export interface SendCardEmailInput {
  to: string;
  subject: string;
  bodyText: string;
  attachments: EmailAttachment[];
}

export async function sendCardEmail(input: SendCardEmailInput): Promise<void> {
  const fromEmail = process.env.SES_FROM_EMAIL;
  if (!fromEmail) {
    throw new Error("SES_FROM_EMAIL must be set to send member card emails.");
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: fromEmail,
    to: input.to,
    subject: input.subject,
    text: input.bodyText,
    attachments: input.attachments.map((attachment) => ({
      filename: attachment.filename,
      content: Buffer.from(attachment.content),
      contentType: "application/pdf",
    })),
  });
}
