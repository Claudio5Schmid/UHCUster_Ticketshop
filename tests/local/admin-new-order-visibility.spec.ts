import { test, expect } from "@playwright/test";
import { createServiceRoleClient } from "./fixtures/cleanup";
import { makeTestCustomer } from "./fixtures/test-data";

const CURRENT_SEASON = "2627";
// Same test product used by the season-pass order test (src/lib/products.ts has no
// dedicated concept of a "test" flag beyond this product's name).
const TEST_PRODUCT_ID = "f0000000-0000-0000-0000-00000000aa02";

test("Admin: Login, neue Bestellung ist als 'neu' markiert, Order-Detail öffnet", async ({ page }) => {
  const customer = makeTestCustomer("admin-visibility");
  const supabase = createServiceRoleClient();

  // Seeds the order directly via the same create_order RPC the real checkout uses (see
  // src/app/(shop)/kasse/actions.ts) - this test is about admin visibility, not checkout,
  // so it skips the browser-driven purchase covered by season-pass-order.spec.ts.
  const { data: order, error } = await supabase.rpc("create_order", {
    p_customer: {
      name: customer.name,
      address_street: customer.addressStreet,
      address_zip: customer.addressZip,
      address_city: customer.addressCity,
      address_country: "CH",
      email: customer.email,
      phone: customer.phone,
    },
    p_lines: [{ product_id: TEST_PRODUCT_ID, holder_name: "Playwright Admin Sichtbarkeit" }],
    p_season: CURRENT_SEASON,
  });
  expect(error).toBeNull();
  const orderNumber: string = order.order_number;

  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/admin");

  // /admin defaults to status=neu, so a fresh order shows up without changing filters.
  await expect(page.getByText(/^\d+ neu$/)).toBeVisible();
  const orderLink = page.getByRole("link", { name: orderNumber });
  await expect(orderLink).toBeVisible();

  await orderLink.click();
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${orderNumber}$`));
  await expect(page.getByRole("heading", { name: orderNumber })).toBeVisible();
  await expect(page.getByText(customer.name, { exact: false })).toBeVisible();
});
