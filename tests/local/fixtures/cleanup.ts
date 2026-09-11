import { createClient } from "@supabase/supabase-js";

export const TEST_EMAIL_DOMAIN = "playwright-test.invalid";

export function testEmail(label: string) {
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-${label}-${unique}@${TEST_EMAIL_DOMAIN}`;
}

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (loaded from .env.local).");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Deletes every order/ticket/customer created by local Playwright runs, identified by the
 * @playwright-test.invalid email tag (see decisions/playwright-retrofit-decisions.md §2).
 * Runs against the production project - there is no isolated test branch - so this must
 * only ever touch rows matching that tag. Delete order respects FK RESTRICT constraints:
 * tickets before order_items/orders (tickets.order_item_id -> order_items RESTRICT), and
 * orders before customers (orders.customer_id -> customers RESTRICT). order_items cascade
 * automatically when their order is deleted.
 */
export async function sweepTestData() {
  const supabase = createServiceRoleClient();

  const { data: customers, error: custErr } = await supabase
    .from("customers")
    .select("id")
    .like("email", `%@${TEST_EMAIL_DOMAIN}`);
  if (custErr) throw custErr;
  const customerIds = (customers ?? []).map((c) => c.id);
  if (customerIds.length === 0) {
    return { customers: 0, orders: 0, tickets: 0 };
  }

  const { data: orders, error: ordErr } = await supabase
    .from("orders")
    .select("id")
    .in("customer_id", customerIds);
  if (ordErr) throw ordErr;
  const orderIds = (orders ?? []).map((o) => o.id);

  let ticketCount = 0;
  if (orderIds.length > 0) {
    const { data: items, error: itemsErr } = await supabase
      .from("order_items")
      .select("id")
      .in("order_id", orderIds);
    if (itemsErr) throw itemsErr;
    const itemIds = (items ?? []).map((i) => i.id);

    if (itemIds.length > 0) {
      const { data: tickets, error: ticketsErr } = await supabase
        .from("tickets")
        .select("id")
        .in("order_item_id", itemIds);
      if (ticketsErr) throw ticketsErr;
      const ticketIds = (tickets ?? []).map((t) => t.id);
      ticketCount = ticketIds.length;

      if (ticketIds.length > 0) {
        const { error: scanErr } = await supabase.from("scan_events").delete().in("ticket_id", ticketIds);
        if (scanErr) throw scanErr;
        const { error: delTicketsErr } = await supabase.from("tickets").delete().in("id", ticketIds);
        if (delTicketsErr) throw delTicketsErr;
      }
    }

    const { error: membersErr } = await supabase.from("members").delete().in("order_id", orderIds);
    if (membersErr) throw membersErr;
  }

  const { error: delOrdersErr } = await supabase.from("orders").delete().in("id", orderIds);
  if (delOrdersErr) throw delOrdersErr;

  const { error: delCustErr } = await supabase.from("customers").delete().in("id", customerIds);
  if (delCustErr) throw delCustErr;

  return { customers: customerIds.length, orders: orderIds.length, tickets: ticketCount };
}

/**
 * checkOrderRateLimit() (src/lib/rate-limit.ts) allows 5 checkout attempts per 10 minutes,
 * keyed by client IP, and every local run shares one bucket. Without clearing it, a handful
 * of runs in a row start failing for real - an actual rate-limit rejection, not a test bug -
 * so this runs alongside sweepTestData() in both global-setup and global-teardown.
 *
 * "unknown" was the only key this cleared for a long time, and it silently stopped matching
 * when the dev server began reporting ::1. The counter then accumulated across runs until
 * the suite failed halfway through on a rejection nobody had caused.
 *
 * Only loopback is ever deleted. A real visitor's attempts are not this suite's to clear,
 * and this runs against the production project.
 */
const LOOPBACK_IPS = ["unknown", "::1", "127.0.0.1"];

export async function resetLocalRateLimit() {
  const supabase = createServiceRoleClient();

  const { error } = await supabase.from("order_rate_limits").delete().in("ip_address", LOOPBACK_IPS);
  if (error) throw error;

  // The same table keys the order lookup and the scanner login under their own
  // prefixes ("order-lookup:::1", "scanner-session:::1").
  for (const ip of LOOPBACK_IPS) {
    const { error: prefixedError } = await supabase.from("order_rate_limits").delete().like("ip_address", `%:${ip}`);
    if (prefixedError) throw prefixedError;
  }
}
