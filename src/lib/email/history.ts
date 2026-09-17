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
 * delivered even though the shop does not otherwise track reading. A cancelled
 * or queued mail never left, which is not a delivery and not a bounce either -
 * "accepted" is the honest reading of both.
 */
const LAST_EVENT_STATUS: Record<string, DeliveryStatus> = {
  sent: "accepted",
  queued: "accepted",
  scheduled: "accepted",
  canceled: "accepted",
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
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY must be set to read the send history.");
  const resend = new Resend(apiKey);

  const collected: SentMailRecord[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await resend.emails.list({ limit: PAGE_SIZE, ...(after ? { after } : {}) });
    if (response.error) throw new Error(response.error.message);

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
