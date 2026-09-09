/**
 * The one line that names a game's when and where - "Mittwoch, 09.09.2026,
 * 19:00 Uhr, Buchholz" - used identically by the hero and the match cards.
 *
 * Formatted on the server only, and pinned to Europe/Zurich: the server runs in
 * UTC and Node's ICU is not the browser's, so letting a client format the same
 * instant would risk a different weekday, a different hour, or a hydration
 * mismatch. Client components receive the finished string.
 */
const dateFormatter = new Intl.DateTimeFormat("de-CH", {
  timeZone: "Europe/Zurich",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatGameDateLine(playedAt: string, venue: string | null): string {
  const when = `${dateFormatter.format(new Date(playedAt))} Uhr`;
  return venue ? `${when}, ${venue}` : when;
}
