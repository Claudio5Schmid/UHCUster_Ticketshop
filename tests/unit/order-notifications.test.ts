import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Brief §4: automatic mail goes out only for source = shop, decided server-side.
 * Resend is mocked at the module boundary, so these tests prove what reaches the
 * provider - not what the UI intended.
 */
const { send } = vi.hoisted(() => ({ send: vi.fn(async () => ({ data: { id: "mock" }, error: null })) }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

// The mailer needs its configuration, and the customer link needs its secret.
process.env.RESEND_API_KEY = "re_test";
process.env.MAIL_FROM_EMAIL = "tickets@uhcuster.ch";
process.env.ORDER_LINK_SECRET = "test-secret-for-order-links";
process.env.NEXT_PUBLIC_SITE_URL = "https://tickets-uhcuster.ch";

import { sendOrderPlacedEmails, type OrderForNotification } from "@/lib/email/order-notifications";

function order(overrides: Partial<OrderForNotification> = {}): OrderForNotification {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    orderNumber: "UHCU-2627-0042",
    source: "shop",
    createdAt: "2026-09-16T10:00:00Z",
    totalRappen: 500000,
    category: "red_castle",
    customer: {
      name: "Muster AG",
      firstName: "Anna",
      lastName: "Muster",
      companyName: "Muster AG",
      email: "anna@muster.ch",
      phone: null,
      addressStreet: "Teststrasse 1",
      addressZip: "8610",
      addressCity: "Uster",
      customerReference: "PO-77",
    },
    items: [{ productName: "Red Castle Club Gold", quantity: 3, holderName: "Muster AG", lineTotalRappen: 500000 }],
    ...overrides,
  };
}

describe("sendOrderPlacedEmails", () => {
  beforeEach(() => {
    send.mockClear();
    process.env.ORDER_NOTIFICATION_EMAIL = "kasse@uhcuster.ch";
  });

  it("sends nothing for an imported order, whatever the caller intended", async () => {
    const result = await sendOrderPlacedEmails(order({ source: "csv_import" }));

    expect(result.skipped).toBe("source");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends exactly one customer mail and one internal mail for a shop order", async () => {
    const result = await sendOrderPlacedEmails(order());

    expect(result).toEqual({ skipped: null, customerSent: true, internalSent: true });
    expect(send).toHaveBeenCalledTimes(2);

    const [customerMail, internalMail] = send.mock.calls.map((call) => (call as unknown as [Record<string, unknown>])[0]);
    expect(customerMail.to).toBe("anna@muster.ch");
    expect(customerMail.subject).toContain("UHCU-2627-0042");
    // No cards in the automatic mail (D77): the office sends them with the invoice.
    expect(customerMail.attachments).toBeUndefined();
    expect(String(customerMail.text)).toContain("/meine-tickets/");

    expect(internalMail.to).toBe("kasse@uhcuster.ch");
    expect(internalMail.subject).toBe("Neue Sponsorenbestellung UHCU-2627-0042 – Rechnung erstellen");
    expect(String(internalMail.text)).toContain("PO-77");
    expect(String(internalMail.text)).toContain("Muster AG");
  });

  it("still confirms to the customer when no office address is configured", async () => {
    delete process.env.ORDER_NOTIFICATION_EMAIL;

    const result = await sendOrderPlacedEmails(order({ category: "saisonabo" }));

    expect(result).toEqual({ skipped: null, customerSent: true, internalSent: false });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("never hands a reserved-TLD address to the provider", async () => {
    const result = await sendOrderPlacedEmails(
      order({ customer: { ...order().customer, email: "e2e-x@playwright-test.invalid" } })
    );

    expect(result.customerSent).toBe(false);
    // Only the office is told.
    expect(send).toHaveBeenCalledTimes(1);
  });
});
