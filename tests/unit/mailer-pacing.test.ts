import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The club's list is ~600 addresses. Two things decide whether that can go out
 * in one run: the pace the mailer keeps against the provider's limit (10 a
 * second per team), and what it does with the 429 that arrives anyway.
 */
const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

process.env.RESEND_API_KEY = "re_test";
process.env.MAIL_FROM_EMAIL = "tickets@uhcuster.ch";

/**
 * The gap between sends is kept in a module-level variable - one queue per
 * server instance, which is the point - so each test takes a fresh copy of the
 * module rather than inheriting where the last one left the queue.
 */
async function freshMailer() {
  vi.resetModules();
  return import("@/lib/email/mailer");
}

const mail = (to = "anna@muster.ch") => ({ to, subject: "Karten", bodyText: "Hallo" });

describe("sendEmail pacing and retries", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ data: { id: "msg" }, error: null });
  });

  it("keeps a floor between consecutive sends, so a long list cannot burst", async () => {
    const { sendEmail } = await freshMailer();

    const started = Date.now();
    for (let i = 0; i < 5; i++) await sendEmail(mail(`a${i}@muster.ch`));
    const elapsed = Date.now() - started;

    // Four gaps between five sends. Under the provider's 10/s either way, and
    // fast enough that 600 addresses are minutes rather than an afternoon.
    expect(elapsed).toBeGreaterThanOrEqual(4 * 120);
    expect(elapsed).toBeLessThan(4 * 400);
    expect(send).toHaveBeenCalledTimes(5);
  });

  it("waits and goes again when the provider says rate limited", async () => {
    const { sendEmail } = await freshMailer();
    send
      .mockResolvedValueOnce({ data: null, error: { name: "rate_limit_exceeded", message: "Too many requests" } })
      .mockResolvedValue({ data: { id: "msg-2" }, error: null });

    const result = await sendEmail(mail());

    expect(result).toEqual({ accepted: true, messageId: "msg-2" });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated rate limits rather than looping forever", async () => {
    const { sendEmail } = await freshMailer();
    send.mockResolvedValue({ data: null, error: { name: "rate_limit_exceeded", message: "Too many requests" } });

    // The backoff runs to twelve seconds end to end, which is right for a real
    // send and far too long to sit through here - so the clock is wound forward
    // rather than the waits shortened for the test's convenience.
    vi.useFakeTimers();
    try {
      const attempt = sendEmail(mail());
      const rejects = expect(attempt).rejects.toThrow(/nicht versendet/);
      await vi.runAllTimersAsync();
      await rejects;
    } finally {
      vi.useRealTimers();
    }

    // The first attempt plus its retries, and then it stops.
    expect(send).toHaveBeenCalledTimes(5);
  });

  it("does not retry a refusal that waiting cannot fix", async () => {
    const { sendEmail } = await freshMailer();
    send.mockResolvedValue({ data: null, error: { name: "validation_error", message: "Invalid `to` field" } });

    await expect(sendEmail(mail())).rejects.toThrow(/validation_error/);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("never reaches the provider with a reserved-TLD address", async () => {
    const { sendEmail } = await freshMailer();

    const result = await sendEmail(mail("e2e@playwright-test.invalid"));

    expect(result).toEqual({ accepted: false, messageId: null });
    expect(send).not.toHaveBeenCalled();
  });
});
