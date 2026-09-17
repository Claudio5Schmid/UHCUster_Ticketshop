import { issueTicketsForOrder } from "@/lib/tickets/issue";

/**
 * Helpers shared by the two checkouts (season pass, Red Castle Club). Kept out
 * of the "use server" action files on purpose: everything exported from one of
 * those is an endpoint any browser can call, and "issue the cards for this
 * order id" is not something to expose.
 */

export async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw new Error("TURNSTILE_SECRET_KEY is not set.");
  }
  if (!token) return false;

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });

  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}

/**
 * Cards are issued the moment an order exists (D75/D77). A failure here is
 * logged and swallowed: the order is committed and the customer must see their
 * order number, not an error. The admin order page offers "Karten erstellen" for
 * exactly this case - the database refuses a second issuance only once the first
 * one succeeded, so retrying there is safe.
 */
export async function issueTicketsAfterCheckout(orderId: string, orderNumber: string): Promise<void> {
  try {
    await issueTicketsForOrder(orderId, { actor: "system" });
  } catch (issueError) {
    console.error(
      `[checkout] Tickets for ${orderNumber} could not be issued:`,
      issueError instanceof Error ? issueError.message : issueError
    );
  }
}
