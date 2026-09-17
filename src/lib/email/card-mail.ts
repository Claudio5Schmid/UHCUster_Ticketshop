/**
 * The frame around a message the office writes by hand and sends with cards
 * attached - member cards and, since the migration, the "new ticket shop" mail
 * to legacy order holders. The office's text is the message; this only adds the
 * block that matters when the attachment is gone: the durable link.
 *
 * Inline styles and one column only - no external CSS, no images, no
 * float/flex/grid - older desktop mail clients drop all of those silently.
 */
export interface CardMailInput {
  /** The small line above the club name: "Mitgliederkarte", "Red Castle Club", ... */
  eyebrow: string;
  /** The office's own message, placeholders already applied. Plain text. */
  bodyText: string;
  /** Signed link to the order (D54). Absolute. */
  statusUrl: string;
  cardCount: number;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Blank lines separate paragraphs, single newlines are line breaks. URLs become links. */
function paragraphs(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#444444;">${escapeHtml(block)
          .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#e4032e;word-break:break-all;">$1</a>')
          .replace(/\n/g, "<br />")}</p>`
    )
    .join("");
}

function cardWord(count: number): string {
  return count === 1 ? "Deine Karte ist" : `Deine ${count} Karten sind`;
}

export function cardMailHtml(input: CardMailInput): string {
  return `<!doctype html>
<html lang="de">
<body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111111;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;">
    <tr>
      <td style="padding:32px;">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6b6b6b;">${escapeHtml(input.eyebrow)}</p>
        <p style="margin:0 0 24px;font-size:22px;font-weight:700;color:#e4032e;">UHC Uster</p>

        ${paragraphs(input.bodyText)}

        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:32px 0 0;background:#fafafa;border-radius:8px;">
          <tr>
            <td style="padding:20px;">
              <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#444444;">
                ${cardWord(input.cardCount)} als PDF an diese E-Mail angehängt. Du kannst sie jederzeit auch hier abrufen:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
                <tr>
                  <td style="background:#e4032e;border-radius:8px;">
                    <a href="${escapeHtml(input.statusUrl)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Karten ansehen</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#6b6b6b;word-break:break-all;">
                Speichere den Link, und behandle ihn wie die Karte selbst - wer ihn hat, kommt an deine Karten.<br />
                <a href="${escapeHtml(input.statusUrl)}" style="color:#6b6b6b;">${escapeHtml(input.statusUrl)}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function cardMailText(input: CardMailInput): string {
  return [
    input.bodyText.trim(),
    "",
    `${cardWord(input.cardCount)} als PDF an diese E-Mail angehängt. Du kannst sie jederzeit auch hier abrufen:`,
    "",
    `  ${input.statusUrl}`,
    "",
    "Speichere den Link, und behandle ihn wie die Karte selbst - wer ihn hat, kommt an deine Karten.",
  ].join("\n");
}
