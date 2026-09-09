/** The season this shop currently sells for. Matches the order-number season code
 * (UHCU-2627-0001) and products.valid_season / games.season. */
export const CURRENT_SEASON = "2627";
export const CURRENT_SEASON_LABEL = "26/27";

/** The Swiss Unihockey API takes the season as its start year (e.g. 2026 for the
 * 2026/27 season) - confirmed by querying the live API, not assumed. */
export const CURRENT_SEASON_START_YEAR = 2026;

/** The league the shop's home games are in, printed on every match card. Not a
 * database field: every game here is the L-UPL team's (docs/DECISIONS.md, team
 * 428535), so a constant is the honest representation. */
export const LEAGUE_LABEL = "L-UPL";
