import { XMLParser } from "fast-xml-parser";

/**
 * Public Swiss Unihockey REST API (api.swissunihockey.ch/rest/v1.0). Verified live
 * on 2026-08-26: no API key needed for these reads, despite the docs mentioning one.
 * UHC Uster's club id is 430; team 428535 ("Herren Aktive GF L-UPL") is the team
 * whose home games this shop sells passes for - it's the exact team named in the
 * Red Castle Club benefits ("Heimspiele des L-UPL-Teams"), confirmed by cross-
 * checking a real fixture against the brief's own stated first-game date
 * (19 September 2026 vs. Zug United, Buchholz Uster).
 */
export const UHC_USTER_CLUB_ID = "430";
export const UHC_USTER_L_UPL_TEAM_ID = "428535";

interface RawGame {
  "@_id": string;
  "@_date": string; // "19.09.2026"
  "@_time": string; // "18:00"
  "@_hometeamid": string;
  "@_awayteamid": string;
  "@_hometeamname": string;
  "@_awayteamname": string;
  "@_played": string;
  gym?: { "#text"?: string } | string;
}

export interface SyncedGame {
  externalId: string;
  opponent: string;
  playedAt: Date;
  venue: string | null;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

/** Converts a Swiss Unihockey date+time (Europe/Zurich wall-clock) to a correct
 * UTC Date, accounting for CET/CEST automatically via Intl's timezone data -
 * avoids a manual DST table or an extra timezone-library dependency. */
function zurichWallTimeToUtc(day: number, month: number, year: number, hour: number, minute: number): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(utcGuess).map((p) => [p.type, p.value]));
  const zurichHour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  const zurichAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), zurichHour, Number(parts.minute));

  const driftMs = zurichAsUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - driftMs);
}

function parseSwissDate(date: string, time: string): Date {
  const [day, month, year] = date.split(".").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return zurichWallTimeToUtc(day, month, year, hour, minute);
}

/** Fetches every scheduled home game for the L-UPL team in a given season
 * (season = the year the season starts, e.g. 2026 for 2026/27 - confirmed against
 * a live query, not assumed). Returns only home games; away games are irrelevant
 * to this shop (it never sells tickets for games UHC Uster doesn't host). */
export async function fetchUpcomingHomeGames(season: number): Promise<SyncedGame[]> {
  const url = `https://api.swissunihockey.ch/rest/v1.0/teams/${UHC_USTER_L_UPL_TEAM_ID}/games?season=${season}`;
  const response = await fetch(url, { headers: { Accept: "application/xml" } });

  if (!response.ok) {
    throw new Error(`Swiss Unihockey API returned ${response.status} for season ${season}`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const rawGames: RawGame[] = parsed?.games?.game ? [].concat(parsed.games.game) : [];

  return rawGames
    .filter((game) => game["@_hometeamid"] === UHC_USTER_L_UPL_TEAM_ID)
    .map((game) => ({
      externalId: game["@_id"],
      opponent: game["@_awayteamname"],
      playedAt: parseSwissDate(game["@_date"], game["@_time"]),
      venue: typeof game.gym === "string" ? game.gym : (game.gym?.["#text"] ?? null),
    }));
}
