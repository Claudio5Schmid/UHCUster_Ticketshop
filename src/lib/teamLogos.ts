/**
 * Opponent club crests for the home-game listings.
 *
 * Keyed by the opponent name as it arrives from the Swiss Unihockey sync
 * (games.opponent, see src/lib/swissunihockey.ts), but looked up through
 * `normalizeTeamName` so casing, umlauts and punctuation can't cause a miss -
 * an admin correcting a game by hand types the name freely, and games.opponent
 * is a plain text column.
 *
 * The files live in /public/logos, every one of them trimmed of its own padding
 * and rendered to the same height, keeping its natural width. Normalising on
 * height rather than into a fixed box is what makes a square emblem and a wide
 * wordmark read at the same size: fitting both into one box would shrink the
 * wide one - UHC Uster's own logo is 2.8:1, so in a 2:1 box it came out barely
 * two thirds the height of a square crest beside it.
 */

export interface TeamLogo {
  src: string;
  width: number;
  height: number;
}

/** Every file in /public/logos is rendered to this height - see the comment above. */
const LOGO_HEIGHT = 160;

/**
 * Each crest's width at that height, i.e. its own aspect ratio. Needed because
 * next/image wants intrinsic dimensions, and here they genuinely differ per club.
 * Regenerate these together with the files if a crest is ever replaced.
 */
const LOGO_WIDTHS: Record<string, number> = {
  "floorball-chur-united": 160,
  "floorball-koeniz-bern": 160,
  "floorball-thurgau": 164,
  "grasshopper-club-zuerich": 160,
  "hc-rychenberg-winterthur": 151,
  "kloten-dietlikon-jets": 171,
  "sv-wiler-ersigen": 239,
  "tigers-langnau": 199,
  "uhc-alligator-malans": 298,
  "uhc-uster": 448,
  "wasa-st-gallen": 268,
  "zug-united": 219,
};

/**
 * The club whose shop this is. Every game in the listings is a home game, so
 * this is always the left-hand side of the pairing - the name matches what
 * Swiss Unihockey calls the team, so the same lookup below resolves it.
 */
export const HOME_TEAM = "UHC Uster";

/**
 * Lowercases, folds German umlauts the way the clubs themselves write them out
 * ("Köniz" / "Koeniz"), strips any remaining diacritics, then drops everything
 * that isn't a letter or digit - so "SV Wiler-Ersigen", "sv wiler ersigen" and
 * "SV Wiler–Ersigen" all collapse to the same key.
 */
function normalizeTeamName(team: string): string {
  return team
    .normalize("NFC")
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * UHC Uster itself, the ten clubs it hosts in 26/27, plus Floorball Thurgau -
 * away-only this season, but kept here so a moved or added fixture doesn't
 * silently fall back to text. Extra keys are naming variants seen in the wild;
 * the sync's own spelling is listed first in each group.
 */
const LOGO_FILES: Record<string, string> = {
  "UHC Uster": "uhc-uster",

  "Floorball Chur United": "floorball-chur-united",
  "Chur United": "floorball-chur-united",

  "Floorball Köniz Bern": "floorball-koeniz-bern",
  "Floorball Köniz-Bern": "floorball-koeniz-bern",

  "Floorball Thurgau": "floorball-thurgau",
  FBTG: "floorball-thurgau",

  "Grasshopper Club Zürich": "grasshopper-club-zuerich",
  "Grasshoppers Club Zürich": "grasshopper-club-zuerich",
  "GC Zürich": "grasshopper-club-zuerich",

  "HC Rychenberg Winterthur": "hc-rychenberg-winterthur",
  "Rychenberg Winterthur": "hc-rychenberg-winterthur",

  "Kloten-Dietlikon Jets": "kloten-dietlikon-jets",
  "Jets Kloten-Dietlikon": "kloten-dietlikon-jets",

  "SV Wiler-Ersigen": "sv-wiler-ersigen",
  "Wiler-Ersigen": "sv-wiler-ersigen",

  "Tigers Langnau": "tigers-langnau",
  "Unihockey Tigers Langnau": "tigers-langnau",

  "UHC Alligator Malans": "uhc-alligator-malans",
  "Alligator Malans": "uhc-alligator-malans",

  "WASA St. Gallen": "wasa-st-gallen",

  "Zug United": "zug-united",
};

const LOGOS_BY_NORMALIZED_NAME = new Map(
  Object.entries(LOGO_FILES).map(([team, file]) => [normalizeTeamName(team), file])
);

/** The club's crest, or null when we don't have one - callers fall back to the name. */
export function getTeamLogo(team: string): TeamLogo | null {
  const file = LOGOS_BY_NORMALIZED_NAME.get(normalizeTeamName(team));
  const width = file ? LOGO_WIDTHS[file] : undefined;
  if (!file || width === undefined) {
    return null;
  }
  return { src: `/logos/${file}.png`, width, height: LOGO_HEIGHT };
}
