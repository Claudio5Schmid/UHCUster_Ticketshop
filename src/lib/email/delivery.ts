import { getSupabaseAdminClient } from "@/lib/supabase";

/**
 * The record of a mail after it has been handed over, and the one place a later
 * delivery outcome can be matched to something in the shop.
 *
 * Written with the service-role client on every path - the checkout has no
 * session at all, and the webhook is not a person. Failing to record must never
 * fail a send that already went out, so every write here is best-effort and
 * logged rather than thrown: the mail is gone either way, and losing the record
 * costs a follow-up, not the message.
 */

export type EmailKind = "order_confirmation" | "order_notification" | "order_info" | "member_cards" | "test";

export type DeliveryStatus = "accepted" | "delivered" | "delayed" | "bounced" | "complained" | "failed";

export interface RecordedEmail {
  messageId: string | null;
  kind: EmailKind;
  recipient: string;
  subject?: string;
  orderId?: string | null;
  memberId?: string | null;
  /** The cards this mail carried - a bounce reopens exactly these. */
  ticketIds?: string[];
}

export async function recordSentEmail(input: RecordedEmail): Promise<void> {
  // Nothing to follow up on without an id, and a row that no event can ever
  // reach would only make the log look complete when it is not.
  if (!input.messageId) return;

  try {
    const { error } = await getSupabaseAdminClient()
      .from("email_messages")
      .insert({
        provider_message_id: input.messageId,
        kind: input.kind,
        recipient: input.recipient,
        subject: input.subject ?? null,
        order_id: input.orderId ?? null,
        member_id: input.memberId ?? null,
        ticket_ids: input.ticketIds ?? [],
      });
    if (error) throw new Error(error.message);
  } catch (recordError) {
    console.error(
      `[email] ${input.kind} to ${input.recipient} went out but was not recorded:`,
      recordError instanceof Error ? recordError.message : recordError
    );
  }
}

/**
 * What the provider's event names mean here. Anything else is ignored.
 *
 * "Suppressed" is the one that is easy to miss: after a hard bounce Resend puts
 * the address on its suppression list and declines every further send to it
 * without trying. Nothing left the building, so it counts as a failure - a
 * second attempt at a bad address must not read as progress.
 */
const EVENT_STATUS: Record<string, DeliveryStatus> = {
  "email.sent": "accepted",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "failed",
};

export interface ResendEventPayload {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    subject?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    failed?: { reason?: string };
  };
}

export interface DeliveryEvent {
  messageId: string;
  status: DeliveryStatus;
  detail: string | null;
  occurredAt: string;
}

/**
 * The event as this app understands it, or null for one it has no use for -
 * `email.opened` and `email.clicked` say nothing about whether a card arrived,
 * and the shop does not track reading.
 */
export function readDeliveryEvent(payload: ResendEventPayload): DeliveryEvent | null {
  const status = EVENT_STATUS[payload.type ?? ""];
  const messageId = payload.data?.email_id;
  if (!status || !messageId) return null;

  const bounce = payload.data?.bounce;
  const detail =
    [bounce?.subType ?? bounce?.type, bounce?.message, payload.data?.failed?.reason]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(" - ") || null;

  return {
    messageId,
    status,
    detail,
    occurredAt: payload.created_at ?? new Date().toISOString(),
  };
}

/**
 * Carries the outcome into the rows the office reads. Returns false when the id
 * belongs to no message we recorded, which is not an error: a mail sent before
 * this existed, or a test mail, simply has nothing to update.
 */
export async function applyDeliveryEvent(event: DeliveryEvent): Promise<boolean> {
  const { data, error } = await getSupabaseAdminClient().rpc("record_email_status", {
    p_message_id: event.messageId,
    p_status: event.status,
    p_detail: event.detail,
    p_occurred_at: event.occurredAt,
  });
  if (error) throw new Error(error.message);
  return data === true;
}
