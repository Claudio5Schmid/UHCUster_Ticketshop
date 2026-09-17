import { Resend } from "resend";
import type { DeliveryStatus } from "@/lib/email/delivery";

/**
 * What Resend already knows about mails the shop sent before it kept a log.
 *
 * The delivery log (D88) starts at the moment it was deployed. Everything sent
 * before that - the club's whole first card run - has no row to match an event
 * to, so a bounce for one of those arrives at the webhook, finds nothing, and is
 * politely dropped. The office is then looking at a green "versendet" for a
 * member whose card never arrived, which is exactly the thing D88 set out to
 * stop.
 *
 * Resend keeps the history and will list it, each mail with the last thing that
 * happened to it. That is enough to write the missing rows after the fact.
 */

export interface SentMailRecord {
  id: string;
  to: string[];
  subject: string | null;
  createdAt: string;
  status: DeliveryStatus;
}

/**
 * Resend's `last_event` in the shop's own words.
 *
 * An open or a click can only happen to a mail that arrived, so both count as
 * delivered even though the shop does not otherwise track reading. A queued or
 * scheduled mail is on its way and has not failed, so it reads as accepted.
 *
 * "Suppressed" matters more than it looks: after one hard bounce Resend puts the
 * address on its suppression list and quietly declines every further send to it.
 * Nothing left the building, so it belongs with the failures - otherwise the
 * second attempt at a bad address would look like progress.
 *
 * A cancelled mail will never arrive either. The shop never cancels one, but if
 * one ever shows up, counting it as failed puts the cards back on the office's
 * desk, which is the better way to be wrong.
 */
const LAST_EVENT_STATUS: Record<string, DeliveryStatus> = {
  sent: "accepted",
  queued: "accepted",
  scheduled: "accepted",
  suppressed: "failed",
  canceled: "failed",
  delivered: "delivered",
  opened: "delivered",
  clicked: "delivered",
  delivery_delayed: "delayed",
  bounced: "bounced",
  complained: "complained",
  failed: "failed",
};

interface ResendEmailRow {
  id?: string;
  to?: string[] | string | null;
  subject?: string | null;
  created_at?: string | null;
  last_event?: string | null;
}

/**
 * Resend's refusals in words that say what to do about them.
 *
 * The sending key is deliberately restricted to sending - that is the right
 * setting for a key that sits in the web app and is used on every checkout.
 * Reading the history needs a second, full-access key, which is why there is a
 * separate variable for it rather than a note to widen the first one.
 */
function describeResendError(message: string): string {
  if (/restricted to only send/i.test(message)) {
    return (
      "Der hinterlegte Resend-Schlüssel darf nur senden, nicht lesen. " +
      "In Resend unter API Keys einen zweiten Schlüssel mit \"Full access\" erstellen und ihn in Vercel " +
      "als RESEND_HISTORY_API_KEY hinterlegen, dann neu deployen. Der Sende-Schlüssel bleibt wie er ist."
    );
  }
  return `Resend: ${message}`;
}

const PAGE_SIZE = 100;

/**
 * Every mail Resend still has on file, newest first, back to `since`.
 *
 * Paged by id rather than by date because that is what the endpoint offers, and
 * stopped as soon as a page reaches past `since`: the history is long and only
 * the part this shop sent is of any use. `maxPages` is a floor under a runaway
 * loop, not a tuning knob.
 */
export async function listSentMails(since: Date, maxPages = 30): Promise<SentMailRecord[]> {
  const apiKey = process.env.RESEND_HISTORY_API_KEY ?? process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Kein Resend-Schlüssel hinterlegt (RESEND_HISTORY_API_KEY oder RESEND_API_KEY).");
  }
  const resend = new Resend(apiKey);

  const collected: SentMailRecord[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await resend.emails.list({ limit: PAGE_SIZE, ...(after ? { after } : {}) });
    if (response.error) throw new Error(describeResendError(response.error.message));

    const rows = ((response.data as { data?: ResendEmailRow[] } | null)?.data ?? []) as ResendEmailRow[];
    if (rows.length === 0) return collected;

    let reachedTheEnd = false;
    for (const row of rows) {
      const createdAt = row.created_at ? new Date(row.created_at) : null;
      if (!row.id || !createdAt || Number.isNaN(createdAt.getTime())) continue;
      if (createdAt < since) {
        reachedTheEnd = true;
        continue;
      }
      const recipients = Array.isArray(row.to) ? row.to : row.to ? [row.to] : [];
      collected.push({
        id: row.id,
        to: recipients.map((address) => address.trim().toLowerCase()).filter(Boolean),
        subject: row.subject ?? null,
        createdAt: createdAt.toISOString(),
        status: LAST_EVENT_STATUS[row.last_event ?? ""] ?? "accepted",
      });
    }

    if (reachedTheEnd) return collected;
    const hasMore = (response.data as { has_more?: boolean } | null)?.has_more;
    after = rows[rows.length - 1]?.id;
    if (!hasMore || !after) return collected;
  }

  return collected;
}
