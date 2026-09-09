export interface MemberCardsEmailInput {
  /** The office's own message, placeholders already applied. Plain text, exactly as
   *  typed in the send dialog - this template frames it, it never rewrites it. */
  bodyText: string;
  /** Signed link to the member's order (docs/DECISIONS.md D54), the same durable page
   *  a paying customer gets. Absolute, since a relative path in an e-mail goes nowhere. */
  statusUrl: string;
  cardCount: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Blank lines separate paragraphs, single newlines are line breaks - what someone
 *  typing into a textarea means by them. */
function paragraphs(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#444444;">${escapeHtml(block).replace(
          /\n/g,
          "<br />"
        )}</p>`
    )
    .join("");
}

/**
 * The card e-mail used to be plain text with PDFs bolted on, while the customer
 * order confirmation had a designed HTML version - so the members who get their
 * pass from the club received the plainer of the two.
 *
 * The block after the message is the more useful half: an attachment is only ever
 * in the inbox it landed in, and a phone that lost the mail has lost the card. The
 * link is the same durable order page a paying customer gets, so a member can pull
 * their cards up again without asking the office for anything.
 *
 * Same constraints as order-confirmation.ts: inline styles and one column only, no
 * external CSS, no images, no float/flex/grid - older desktop mail clients drop all
 * of those silently.
 */
export function memberCardsHtml(input: MemberCardsEmailInput): string {
  const cardWord = input.cardCount === 1 ? "Deine Karte ist" : `Deine ${input.cardCount} Karten sind`;

  return `<!doctype html>
<html lang="de">
<body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111111;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;">
    <tr>
      <td style="padding:32px;">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6b6b6b;">Mitgliederkarte</p>
        <p style="margin:0 0 24px;font-size:22px;font-weight:700;color:#e4032e;">UHC Uster</p>

        ${paragraphs(input.bodyText)}

        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:32px 0 0;background:#fafafa;border-radius:8px;">
          <tr>
            <td style="padding:20px;">
              <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#444444;">
                ${cardWord} als PDF an diese E-Mail angehängt. Du kannst sie jederzeit auch hier abrufen:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
                <tr>
                  <td style="background:#e4032e;border-radius:8px;">
                    <a href="${escapeHtml(
                      input.statusUrl
                    )}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Karten ansehen</a>
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

/** The plain-text half. The office's message stays the message; the link is appended
 *  the same way the HTML version frames it, for clients that show text only. */
export function memberCardsText(input: MemberCardsEmailInput): string {
  const cardWord = input.cardCount === 1 ? "Deine Karte ist" : `Deine ${input.cardCount} Karten sind`;

  return [
    input.bodyText.trim(),
    "",
    `${cardWord} als PDF an diese E-Mail angehängt. Du kannst sie jederzeit auch hier abrufen:`,
    "",
    `  ${input.statusUrl}`,
    "",
    "Speichere den Link, und behandle ihn wie die Karte selbst - wer ihn hat, kommt an deine Karten.",
  ].join("\n");
}
