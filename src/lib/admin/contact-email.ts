import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * An address lives in two rows, and the two are read by different things: the card
 * e-mail goes to members.email, the order confirmation and the invoice to
 * customers.email. Correcting one and not the other is how a member ends up with
 * their cards at the new address and the bill at the old one - the same drift that
 * left 63 cards printing a name every screen showed correctly (D62).
 *
 * So both entry points write both rows. Editing the member updates the customer on
 * their order; editing the order updates the member the order belongs to, if there
 * is one. A shop order has no member row and simply updates the customer.
 */

/** Deliberately loose. It rules out what cannot be delivered at all - no @, nothing
 *  after it, no dot in the domain - and nothing else. A stricter pattern would still
 *  wave through the typo that actually happens ("gmail.con") while starting to
 *  reject addresses that are perfectly valid. */
const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

export function normaliseEmail(input: string): string {
  const email = input.trim();
  if (!PLAUSIBLE_EMAIL.test(email)) {
    throw new Error("Das sieht nicht nach einer gültigen E-Mail-Adresse aus.");
  }
  return email;
}

/** Updates the member and, if their cards hang off an order, its customer too. */
export async function setMemberEmail(memberId: string, rawEmail: string): Promise<void> {
  const email = normaliseEmail(rawEmail);
  const supabase = await getSupabaseServerClient();

  const { data: member, error: loadError } = await supabase
    .from("members")
    .select("id, order_id")
    .eq("id", memberId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!member) throw new Error("Mitglied nicht gefunden.");

  const { error } = await supabase.from("members").update({ email }).eq("id", memberId);
  if (error) throw new Error(error.message);

  if (member.order_id) await setCustomerEmailForOrder(member.order_id as string, email);
}

/** Updates the order's customer and the member it belongs to, if it belongs to one. */
export async function setOrderEmail(orderId: string, rawEmail: string): Promise<void> {
  const email = normaliseEmail(rawEmail);
  const supabase = await getSupabaseServerClient();

  await setCustomerEmailForOrder(orderId, email);

  const { error } = await supabase.from("members").update({ email }).eq("order_id", orderId);
  if (error) throw new Error(error.message);
}

async function setCustomerEmailForOrder(orderId: string, email: string): Promise<void> {
  const supabase = await getSupabaseServerClient();

  const { data: order, error: loadError } = await supabase
    .from("orders")
    .select("customer_id")
    .eq("id", orderId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!order?.customer_id) return;

  const { error } = await supabase.from("customers").update({ email }).eq("id", order.customer_id as string);
  if (error) throw new Error(error.message);
}
