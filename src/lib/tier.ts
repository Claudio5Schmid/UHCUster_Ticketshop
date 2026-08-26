/**
 * Price-dependent visual treatment, derived purely from a numeric tier level.
 * Per the brief: "the gradation must come from the data model (tier_level), never
 * hardcoded per product." Higher tiers get calmer, quieter, more spacious - not
 * louder - so nothing here reads a product slug or name, only the number.
 */

export const TIER_MIN = 0;
export const TIER_MAX = 4;

export interface TierStyle {
  /** Card inner padding in px - more whitespace at higher tiers. */
  padding: number;
  /** Drop-shadow alpha - quieter (flatter) at higher tiers. */
  shadowOpacity: number;
  /** Border alpha - higher tiers lean on a fine border instead of a shadow/badge. */
  borderOpacity: number;
  /** How saturated/present the red accent is, 0-1 - restrained at higher tiers. */
  accentIntensity: number;
  /** Vertical rhythm between internal elements in px - more air at higher tiers. */
  gap: number;
}

function clampTier(tier: number): number {
  return Math.min(TIER_MAX, Math.max(TIER_MIN, tier));
}

export function getTierStyle(tier: number): TierStyle {
  const t = clampTier(tier);
  const progress = t / TIER_MAX; // 0 = entry level, 1 = most premium

  return {
    padding: Math.round(24 + progress * 16),
    shadowOpacity: Number((0.08 - progress * 0.05).toFixed(3)),
    borderOpacity: Number((0.08 + progress * 0.14).toFixed(3)),
    accentIntensity: Number((1 - progress * 0.7).toFixed(2)),
    gap: Math.round(12 + progress * 8),
  };
}

/** CSS custom properties for a given tier, ready to spread onto an element's style. */
export function tierCssVars(tier: number): Record<string, string> {
  const s = getTierStyle(tier);
  return {
    "--tier-padding": `${s.padding}px`,
    "--tier-shadow-opacity": `${s.shadowOpacity}`,
    "--tier-border-opacity": `${s.borderOpacity}`,
    "--tier-accent-intensity": `${s.accentIntensity}`,
    "--tier-gap": `${s.gap}px`,
  };
}
