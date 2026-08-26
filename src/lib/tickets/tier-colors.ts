/**
 * Ticket-PDF-only accent colors (docs/DECISIONS.md D29). The website itself never
 * uses literal gold/silver/bronze - tier gradation there is spacing/shadow/border
 * only (src/lib/tier.ts). Claudio asked specifically for the printed pass to use
 * real metal tones matching each Red Castle Club tier's name. Still a pure function
 * of tier_level, not a product slug/name lookup - tier 0-1 (season passes, and the
 * "Normal" Red Castle Club tier) stay on the site's plain red; only 2/3/4 get metal.
 */

export interface TicketAccentColor {
  /** Band/heading accent, as 0-1 RGB tuples for pdf-lib's rgb(). */
  accent: [number, number, number];
  /** Light background tint for the header band. */
  tint: [number, number, number];
  /** Printed name of the metal, or null for the plain-red tiers. */
  metalName: string | null;
}

const SITE_RED: TicketAccentColor = {
  accent: [0.894, 0.012, 0.18], // #E4032E
  tint: [0.98, 0.94, 0.945],
  metalName: null,
};

const BRONZE: TicketAccentColor = {
  accent: [0.596, 0.396, 0.161], // #983F41-ish warm bronze
  tint: [0.965, 0.925, 0.878],
  metalName: "Bronze",
};

const SILBER: TicketAccentColor = {
  accent: [0.502, 0.522, 0.541], // muted silver-grey
  tint: [0.933, 0.937, 0.941],
  metalName: "Silber",
};

const GOLD: TicketAccentColor = {
  accent: [0.694, 0.553, 0.169], // muted, print-safe gold (not neon yellow)
  tint: [0.969, 0.941, 0.867],
  metalName: "Gold",
};

export function getTicketAccentColor(productType: "season_pass" | "membership", tierLevel: number): TicketAccentColor {
  if (productType !== "membership") {
    return SITE_RED;
  }
  if (tierLevel >= 4) return GOLD;
  if (tierLevel === 3) return SILBER;
  if (tierLevel === 2) return BRONZE;
  return SITE_RED;
}
