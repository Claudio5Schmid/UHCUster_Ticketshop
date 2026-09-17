import { describe, expect, it } from "vitest";
import { newestDeliveryStatus } from "@/lib/email/newest-status";

/**
 * The rule the shop shows a status by: every resend has its own id at the
 * provider, so what the customer's row says is the newest send's outcome.
 */
describe("newestDeliveryStatus", () => {
  it("has nothing to say before anything was sent", () => {
    expect(newestDeliveryStatus([])).toBeNull();
    expect(newestDeliveryStatus(null)).toBeNull();
  });

  it("reads the newest send, not the one that happens to come first", () => {
    const mails = [
      { kind: "order_info", status: "bounced", sent_at: "2026-09-16T08:00:00Z" },
      { kind: "order_info", status: "delivered", sent_at: "2026-09-17T09:30:00Z" },
    ];
    expect(newestDeliveryStatus(mails)).toBe("delivered");
    expect(newestDeliveryStatus([...mails].reverse())).toBe("delivered");
  });

  it("lets the newest send fail even after an older one arrived", () => {
    expect(
      newestDeliveryStatus([
        { kind: "order_info", status: "delivered", sent_at: "2026-09-16T08:00:00Z" },
        { kind: "order_info", status: "bounced", sent_at: "2026-09-17T09:30:00Z" },
      ])
    ).toBe("bounced");
  });

  it("ignores the note to the office and a test mail", () => {
    expect(
      newestDeliveryStatus([
        { kind: "order_info", status: "delivered", sent_at: "2026-09-16T08:00:00Z" },
        { kind: "order_notification", status: "bounced", sent_at: "2026-09-18T08:00:00Z" },
        { kind: "test", status: "bounced", sent_at: "2026-09-19T08:00:00Z" },
      ])
    ).toBe("delivered");
  });

  it("still answers when only the office note exists", () => {
    expect(newestDeliveryStatus([{ kind: "order_notification", status: "delivered", sent_at: "2026-09-18T08:00:00Z" }])).toBeNull();
  });

  it("counts the cards mail and the confirmation as the customer's", () => {
    expect(newestDeliveryStatus([{ kind: "member_cards", status: "delayed", sent_at: "2026-09-18T08:00:00Z" }])).toBe("delayed");
    expect(newestDeliveryStatus([{ kind: "order_confirmation", status: "delivered", sent_at: "2026-09-18T08:00:00Z" }])).toBe("delivered");
  });
});
