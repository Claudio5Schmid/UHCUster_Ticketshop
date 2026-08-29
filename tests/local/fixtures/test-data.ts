import { testEmail } from "./cleanup";

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

  await page.waitForFunction(() => {
    const el = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
    return !!el?.value;
  });

  await page.getByRole("button", { name: "Bestellung abschicken" }).click();
}
