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
 * keyed by client IP. Local dev never sets x-forwarded-for, so every local checkout attempt
 * - the season-pass test and the RCC membership test alike - shares one "unknown" bucket.
 * Without clearing it, a handful of local test runs in a row would start failing for real
 * (not a test bug, an actual rate-limit rejection), so this runs alongside sweepTestData()
 * in both global-setup and global-teardown.
 */
export async function resetLocalRateLimit() {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("order_rate_limits").delete().eq("ip_address", "unknown");
  if (error) throw error;
}
