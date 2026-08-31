/**
 * Opponent club crests for the home-game listings.
 *
 * Keyed by the opponent name as it arrives from the Swiss Unihockey sync
 * (games.opponent, see src/lib/swissunihockey.ts), but looked up through
 * `normalizeTeamName` so casing, umlauts and punctuation can't cause a miss -
 * an admin correcting a game by hand types the name freely, and games.opponent
 * is a plain text column.
 *
 * The files live in /public/logos, every one of them rendered onto the same
 * 320x160 transparent canvas, so a crest always occupies an identical box and
 * the rows line up whatever the club's own aspect ratio is.
 */

export interface TeamLogo {
  src: string;
  width: number;
  height: number;
}

/** Every file in /public/logos shares this canvas - see the comment above. */
const LOGO_WIDTH = 320;
const LOGO_HEIGHT = 160;

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
 * The ten clubs UHC Uster hosts in 26/27, plus Floorball Thurgau - away-only
 * this season, but kept here so a moved or added fixture doesn't silently fall
 * back to text. Extra keys are naming variants seen in the wild; the sync's own
 * spelling is listed first in each group.
 */
const LOGO_FILES: Record<string, string> = {
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
  if (!file) {
    return null;
  }
  return { src: `/logos/${file}.png`, width: LOGO_WIDTH, height: LOGO_HEIGHT };
}
