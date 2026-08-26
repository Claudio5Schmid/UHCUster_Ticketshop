/** The season this shop currently sells for. Matches the order-number season code
 * (UHCU-2627-0001) and products.valid_season / games.season. */
export const CURRENT_SEASON = "2627";
export const CURRENT_SEASON_LABEL = "26/27";

/** The Swiss Unihockey API takes the season as its start year (e.g. 2026 for the
 * 2026/27 season) - confirmed by querying the live API, not assumed. */
export const CURRENT_SEASON_START_YEAR = 2026;
