/**
 * Real metal accent colors for the Red Castle Club tiers (docs/DECISIONS.md D29).
 * Originally PDF-only - the website's own rule was spacing/shadow/border gradation
 * only, never literal gold/silver/bronze (src/lib/tier.ts, still the default for
 * everything not overridden here). D47 reuses these exact same tones for the shop
 * cards too, so the web card and the printed pass agree on what "Gold" looks like.
 * Still a pure function of tier_level, not a product slug/name lookup - tier 0-1
 * (season passes, and the "Normal" Red Castle Club tier) stay on the site's plain
 * red; only 2/3/4 get metal.
 */

export interface TicketAccentColor {
  /** Band/heading accent, as 0-1 RGB tuples for pdf-lib's rgb(). */
  accent: [number, number, number];
  /** Light background tint for the header band. */
  tint: [number, number, number];
  /** Printed name of the metal, or null for the plain-red tiers. */
  metalName: string | null;
  /** Same accent/tint as CSS hex - so the web card and the printed pass use the
   * literal same metal tone, not two independently-tuned colors (post-Phase-8,
   * D47 - reuses D29's PDF colors for the shop cards instead of inventing new ones). */
  accentHex: string;
  tintHex: string;
}

function toHex([r, g, b]: [number, number, number]): string {
  const channel = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function withHex(color: Omit<TicketAccentColor, "accentHex" | "tintHex">): TicketAccentColor {
  return { ...color, accentHex: toHex(color.accent), tintHex: toHex(color.tint) };
}

const SITE_RED: TicketAccentColor = withHex({
  accent: [0.894, 0.012, 0.18], // #E4032E
  tint: [0.98, 0.94, 0.945],
  metalName: null,
});

const BRONZE: TicketAccentColor = withHex({
  accent: [0.596, 0.396, 0.161], // #983F41-ish warm bronze
  tint: [0.965, 0.925, 0.878],
  metalName: "Bronze",
});

const SILBER: TicketAccentColor = withHex({
  accent: [0.502, 0.522, 0.541], // muted silver-grey
  tint: [0.933, 0.937, 0.941],
  metalName: "Silber",
});

const GOLD: TicketAccentColor = withHex({
  accent: [0.694, 0.553, 0.169], // muted, print-safe gold (not neon yellow)
  tint: [0.969, 0.941, 0.867],
  metalName: "Gold",
});

export function getTicketAccentColor(productType: "season_pass" | "membership", tierLevel: number): TicketAccentColor {
  if (productType !== "membership") {
    return SITE_RED;
  }
  if (tierLevel >= 4) return GOLD;
  if (tierLevel === 3) return SILBER;
  if (tierLevel === 2) return BRONZE;
  return SITE_RED;
}
