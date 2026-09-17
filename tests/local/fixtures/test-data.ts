import { createServiceRoleClient, testEmail } from "./cleanup";

/** The dedicated test product (CHF 1.00, "please don't buy"). */
export const TEST_PRODUCT_ID = "f0000000-0000-0000-0000-00000000aa02";

/**
 * A product the create_order RPC accepts for seeding: the test product while it
 * is switched on, otherwise the free Sponsoren-Legi pass - create_order refuses
 * an inactive product, and the office switches the test product off between
 * test periods so it stays out of the shop. Browser flows that need the test
 * product on the page cannot use this and stay dependent on it being active.
 */
export async function seedProductId(): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data: test } = await supabase.from("products").select("id, active").eq("id", TEST_PRODUCT_ID).maybeSingle();
  if (test?.active) return TEST_PRODUCT_ID;
  const { data: fallback } = await supabase.from("products").select("id").eq("slug", "sponsoren-legi").eq("active", true).maybeSingle();
  if (!fallback) throw new Error("No active product to seed an order with - switch the test product on.");
  return fallback.id as string;
}

export function makeTestCustomer(label: string) {
  return {
    name: `Playwright Test ${label}`,
    email: testEmail(label),
    phone: "079 000 00 00",
    addressStreet: "Teststrasse 1",
    addressZip: "8610",
    addressCity: "Uster",
  };
}

/** Waits for Cloudflare Turnstile's test widget to produce a token, then submits the checkout form. */
export async function fillAndSubmitCheckout(
  page: import("@playwright/test").Page,
  customer: ReturnType<typeof makeTestCustomer>,
) {
  await page.getByLabel("Name", { exact: true }).fill(customer.name);
  await page.getByLabel("E-Mail").fill(customer.email);
  await page.getByLabel("Telefon").fill(customer.phone);
  await page.getByLabel("Strasse und Nr.").fill(customer.addressStreet);
  await page.getByLabel("PLZ").fill(customer.addressZip);
  await page.getByLabel("Ort").fill(customer.addressCity);
  // The payment terms (30 days net) are a required tick since the invoice flow.
  await page.getByRole("checkbox", { name: /30 Tagen netto/ }).check();

  await page.waitForFunction(() => {
    const el = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
    return !!el?.value;
  });

  await page.getByRole("button", { name: "Bestellung abschicken" }).click();
}
