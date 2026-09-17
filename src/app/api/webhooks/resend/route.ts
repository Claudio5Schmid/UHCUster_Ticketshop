import { NextResponse } from "next/server";
import { verifyResendSignature } from "@/lib/email/webhook-signature";
import { readDeliveryEvent, applyDeliveryEvent, type ResendEventPayload } from "@/lib/email/delivery";

/**
 * What Resend tells us after it has taken a message: delivered, delayed,
 * bounced, complained.
 *
 * Until this existed the shop only knew that the provider had accepted a mail,
 * and marked the order informed and the card sent on the strength of that. The
 * first real send made the gap plain - three of ninety-nine bounced and all
 * three still read as sent in the admin. A bounce now takes those marks back,
 * so what the office sees is delivery rather than a handover receipt.
 *
 * Answers 200 to anything it has verified, including events about messages it
 * does not know: a retry loop over an event we can do nothing with helps
 * nobody. Only a bad signature and a failed write are errors.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not set - the event was refused.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // The bytes as received: parsing first and re-serialising would change the
  // JSON and the signature could never match again.
  const rawBody = await request.text();

  const verification = verifyResendSignature(rawBody, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  }, secret);

  if (!verification.ok) {
    console.warn(`[resend-webhook] Rejected an event: ${verification.reason}.`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: ResendEventPayload;
  try {
    payload = JSON.parse(rawBody) as ResendEventPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = readDeliveryEvent(payload);
  if (!event) {
    // Opens and clicks say nothing about whether a card arrived.
    return NextResponse.json({ ignored: payload.type ?? "unknown" });
  }

  try {
    const applied = await applyDeliveryEvent(event);
    if (!applied) {
      console.warn(`[resend-webhook] ${event.status} for an unknown message ${event.messageId}.`);
    } else if (event.status === "bounced" || event.status === "complained" || event.status === "failed") {
      console.warn(`[resend-webhook] ${event.status} for ${event.messageId}: ${event.detail ?? "no reason given"}.`);
    }
    return NextResponse.json({ applied });
  } catch (applyError) {
    // A 500 is right here: the event is ours and we failed to record it, so the
    // provider should try again.
    console.error(`[resend-webhook] Could not record ${event.status} for ${event.messageId}:`, applyError);
    return NextResponse.json({ error: "Could not record the event" }, { status: 500 });
  }
}
