import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyResendSignature } from "@/lib/email/webhook-signature";
import { readDeliveryEvent } from "@/lib/email/delivery";

/**
 * The webhook is the only thing standing between "Resend says it bounced" and
 * the admin still showing a green tick, so both halves are pinned down: nothing
 * unsigned gets in, and a signed event is read the way it is meant.
 */

const SECRET = "whsec_" + Buffer.from("a-test-signing-secret-32-bytes!!").toString("base64");

function sign(body: string, id: string, timestamp: string, secret = SECRET) {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  return "v1," + createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

function headers(body: string, overrides: Partial<{ id: string; timestamp: string; signature: string }> = {}) {
  const id = overrides.id ?? "msg_1";
  const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
  return {
    id,
    timestamp,
    signature: overrides.signature ?? sign(body, id, timestamp),
  };
}

describe("verifyResendSignature", () => {
  const body = JSON.stringify({ type: "email.bounced", data: { email_id: "abc" } });

  it("accepts a correctly signed request", () => {
    expect(verifyResendSignature(body, headers(body), SECRET)).toEqual({ ok: true });
  });

  it("refuses a tampered body", () => {
    const signed = headers(body);
    expect(verifyResendSignature(body + " ", signed, SECRET)).toEqual({ ok: false, reason: "signature mismatch" });
  });

  it("refuses another secret's signature", () => {
    const other = "whsec_" + Buffer.from("a-different-signing-secret-32b!!").toString("base64");
    const signed = headers(body, { signature: sign(body, "msg_1", String(Math.floor(Date.now() / 1000)), other) });
    expect(verifyResendSignature(body, signed, SECRET).ok).toBe(false);
  });

  it("refuses a replay from outside the tolerance", () => {
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    expect(verifyResendSignature(body, headers(body, { timestamp: old }), SECRET)).toEqual({
      ok: false,
      reason: "timestamp outside tolerance",
    });
  });

  it("refuses a request without the headers", () => {
    expect(verifyResendSignature(body, { id: null, timestamp: null, signature: null }, SECRET).ok).toBe(false);
  });

  it("accepts during a secret rotation, where two signatures are sent", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const other = "whsec_" + Buffer.from("a-different-signing-secret-32b!!").toString("base64");
    const both = `${sign(body, "msg_1", timestamp, other)} ${sign(body, "msg_1", timestamp)}`;
    expect(verifyResendSignature(body, { id: "msg_1", timestamp, signature: both }, SECRET)).toEqual({ ok: true });
  });
});

describe("readDeliveryEvent", () => {
  it("reads a bounce with its reason", () => {
    const event = readDeliveryEvent({
      type: "email.bounced",
      created_at: "2026-09-17T08:00:00.000Z",
      data: {
        email_id: "e1",
        bounce: { type: "Permanent", subType: "Suppressed", message: "The recipient is on the suppression list" },
      },
    });
    expect(event).toEqual({
      messageId: "e1",
      status: "bounced",
      detail: "Suppressed - The recipient is on the suppression list",
      occurredAt: "2026-09-17T08:00:00.000Z",
    });
  });

  it("maps the outcomes the shop acts on", () => {
    const status = (type: string) => readDeliveryEvent({ type, data: { email_id: "e1" } })?.status;
    expect(status("email.sent")).toBe("accepted");
    expect(status("email.delivered")).toBe("delivered");
    expect(status("email.delivery_delayed")).toBe("delayed");
    expect(status("email.complained")).toBe("complained");
  });

  it("ignores what says nothing about arrival", () => {
    expect(readDeliveryEvent({ type: "email.opened", data: { email_id: "e1" } })).toBeNull();
    expect(readDeliveryEvent({ type: "email.clicked", data: { email_id: "e1" } })).toBeNull();
    // An event without a message id cannot be matched to anything.
    expect(readDeliveryEvent({ type: "email.bounced", data: {} })).toBeNull();
  });
});
