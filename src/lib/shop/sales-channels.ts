import { getSupabaseClient } from "@/lib/supabase";
import type { Product } from "@/lib/products";

/**
 * Whether the shop sells a kind of product itself, or only shows it and sends
 * the visitor to uhcuster.ch.
 *
 * The shop has no payment provider and no link into the club's bookkeeping, so
 * every order placed here is one the office enters by hand. Until that is
 * connected, both kinds are sold on the club's own site - a switch rather than a
 * deploy, so it can be turned back the day the payment side is ready.
 */
export type SalesChannelType = "season_pass" | "membership";

export interface SalesChannel {
  productType: SalesChannelType;
  redirectToWebsite: boolean;
  websiteUrl: string | null;
}

/**
 * Products the switch never touches.
 *
 * The test product is the only way to walk the checkout end to end; sending it
 * to uhcuster.ch too would leave no way to try a purchase while the switch is
 * on. Named by slug because that is what identifies it - if it is ever deleted,
 * this simply stops matching.
 */
export const ALWAYS_IN_SHOP_SLUGS: readonly string[] = ["test-saisonkarte"];

export async function getSalesChannels(): Promise<SalesChannel[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("sales_channels")
    .select("product_type, redirect_to_website, website_url");

  if (error) {
    throw new Error(`Failed to load sales channels: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    productType: row.product_type as SalesChannelType,
    redirectToWebsite: row.redirect_to_website,
    websiteUrl: row.website_url,
  }));
}

/**
 * The address this product's button should lead to, or null when it is sold
 * here. A channel switched on without an address cannot happen - the database
 * refuses that combination - but null is still handled rather than trusted, so a
 * misconfiguration shows up as the ordinary cart button instead of a dead link.
 */
export function resolveRedirectUrl(product: Product, channels: SalesChannel[]): string | null {
  if (ALWAYS_IN_SHOP_SLUGS.includes(product.slug)) return null;

  const channel = channels.find((entry) => entry.productType === product.type);
  if (!channel?.redirectToWebsite) return null;

  return channel.websiteUrl;
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
