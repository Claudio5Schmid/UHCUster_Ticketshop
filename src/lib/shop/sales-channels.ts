import { getSupabaseClient } from "@/lib/supabase";
import type { Product } from "@/lib/products";

/**
 * How a kind of product can be bought, while the shop has no payment provider
 * and no link into the club's bookkeeping - every order placed here is one the
 * office enters by hand.
 *
 *  - shop:     the cart and checkout here, as originally built.
 *  - website:  the card is shown and its button leads to uhcuster.ch.
 *  - disabled: the card is shown with its price and benefits, and the button
 *              simply does not work. For offers the club's own page cannot take
 *              properly either - its order form has no field for the split
 *              between Erwachsene, Reduziert and Sponsoren Legi.
 *
 * A setting rather than a deploy, so it can be turned back the day the payment
 * side is ready - by Claudio, not by a release.
 */
export type SalesChannelType = "season_pass" | "membership";
export type SalesMode = "shop" | "website" | "disabled";

export interface SalesChannel {
  productType: SalesChannelType;
  mode: SalesMode;
  websiteUrl: string | null;
  /** A line under the button - an ordering deadline, say. Null means none. */
  note: string | null;
}

/**
 * What one product's button should do, and the line under it.
 *
 * The note travels with the decision rather than beside it, because the two are
 * one thought: a button that does not work and no word about why is what makes
 * the office's phone ring.
 */
export type ProductPurchase =
  | { kind: "cart"; note: string | null }
  | { kind: "link"; url: string; note: string | null }
  | { kind: "disabled"; note: string | null };

/**
 * Products the setting never touches.
 *
 * The test product is the only way to walk the checkout end to end; taking it
 * with the rest would leave no way to do that. Named by slug because that is
 * what identifies it - if it is ever deleted, this simply stops matching.
 */
export const ALWAYS_IN_SHOP_SLUGS: readonly string[] = ["test-saisonkarte"];

export async function getSalesChannels(): Promise<SalesChannel[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("sales_channels").select("product_type, mode, website_url, note");

  if (error) {
    throw new Error(`Failed to load sales channels: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    productType: row.product_type as SalesChannelType,
    mode: row.mode as SalesMode,
    websiteUrl: row.website_url,
    note: row.note,
  }));
}

export function resolvePurchase(product: Product, channels: SalesChannel[]): ProductPurchase {
  // An exempt product carries no note either: a line about season-pass ordering
  // being closed has nothing to do with a card that is still on sale here.
  if (ALWAYS_IN_SHOP_SLUGS.includes(product.slug)) return { kind: "cart", note: null };

  const channel = channels.find((entry) => entry.productType === product.type);
  if (!channel) return { kind: "cart", note: null };

  const note = channel.note;

  if (channel.mode === "disabled") return { kind: "disabled", note };

  // A website mode without an address cannot be saved - the database refuses the
  // combination - but it is handled rather than trusted, so a misconfiguration
  // shows up as a dead button rather than a link to nowhere.
  if (channel.mode === "website") {
    return channel.websiteUrl ? { kind: "link", url: channel.websiteUrl, note } : { kind: "disabled", note };
  }

  return { kind: "cart", note };
}

/**
 * "Auf uhcuster.ch kaufen" - read off the address itself, so the button keeps
 * telling the truth if the target is ever pointed somewhere else.
 */
export function redirectButtonLabel(url: string): string {
  try {
    return `Auf ${new URL(url).hostname.replace(/^www\./, "")} kaufen`;
  } catch {
    return "Auf der Website kaufen";
  }
}
