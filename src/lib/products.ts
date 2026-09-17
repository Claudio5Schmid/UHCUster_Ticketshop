import { getSupabaseClient } from "@/lib/supabase";

export interface ProductBenefits {
  highlights?: string[];
  /** Reference price for the savings calculation, in Rappen. Only set on products
   * that are directly comparable to a single-game ticket (see docs/DECISIONS.md and
   * the brief: "show the equivalent single-ticket value and the saving... calculated,
   * not maintained as text"). */
  single_ticket_price_rappen?: number;
  /** How many tickets one purchase produces (Red Castle Club bundles > 1, D5/D22).
   * Defaults to 1 when absent - see create_order() in the database. */
  included_passes?: number;
  /** Whether the resulting ticket(s) can be handed to anyone (a shared company/group
   * label) rather than requiring one named holder per pass. Defaults to false. */
  transferable?: boolean;
}

/** The two-level catalog (D71/O1): what the import and the order form speak in.
 * `type` stays what it was - the card design and the sales-channel switch key on
 * it - while category/variant name the product the way the office does. */
export type ProductCategory = "red_castle" | "saisonabo" | "mitglieder";

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  red_castle: "Red Castle Club",
  saisonabo: "Saisonabo",
  mitglieder: "Mitglieder",
};

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: "season_pass" | "membership";
  price_rappen: number;
  tier_level: number;
  benefits: ProductBenefits;
  sort_order: number;
  valid_season: string;
  /** Null only on the test product, which is neither sold nor imported. */
  category: ProductCategory | null;
  variant: string | null;
}

const PRODUCT_COLUMNS =
  "id, slug, name, description, type, price_rappen, tier_level, benefits, sort_order, valid_season, category, variant";

export async function getActiveProducts(): Promise<Product[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to load products: ${error.message}`);
  }

  return data ?? [];
}

/**
 * One active product by its category and variant key - what the Red Castle
 * order page resolves "?variante=gold" to. Null when the variant does not exist
 * or is not on sale, so a stale link shows "nicht verfügbar" rather than an error.
 */
export async function getActiveProductByVariant(category: ProductCategory, variant: string): Promise<Product | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("active", true)
    .eq("category", category)
    .eq("variant", variant)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load product: ${error.message}`);
  }
  return data ?? null;
}
