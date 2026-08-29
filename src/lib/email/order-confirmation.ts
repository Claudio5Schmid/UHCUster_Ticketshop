import { formatRappenAsChf } from "@/lib/pricing";

export interface OrderConfirmationEmailItem {
  product_name: string;
  holder_name: string | null;
  line_total_rappen: number;
}

export interface OrderConfirmationEmailInput {
  orderNumber: string;
  customerName: string;
  totalRappen: number;
  items: OrderConfirmationEmailItem[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function itemLabel(item: OrderConfirmationEmailItem): string {
  return item.holder_name ? `${item.product_name} - ${item.holder_name}` : item.product_name;
}

export function orderConfirmationSubject(orderNumber: string): string {
  return `Bestellbestätigung UHC Uster - ${orderNumber}`;
}

/**
 * Deliberately says the same three things as the on-screen confirmation
 * (src/app/(shop)/kasse/page.tsx), because this mail is the only durable copy the
 * customer gets - closing the tab used to lose the order number entirely. It also
 * states outright that it is *not* the invoice, since there is no online payment and
 * the real bill follows by hand from the club office days later.
 */
export function orderConfirmationText(input: OrderConfirmationEmailInput): string {
  const lines = input.items.map((item) => `  - ${itemLabel(item)}: ${formatRappenAsChf(item.line_total_rappen)}`);

  return [
    `Hallo ${input.customerName}`,
    "",
    "Vielen Dank für deine Bestellung beim UHC Uster. Wir haben sie erhalten.",
    "",
    `Bestellnummer: ${input.orderNumber}`,
    "",
    "Deine Bestellung:",
    ...lines,
    "",
    `Total: ${formatRappenAsChf(input.totalRappen)}`,
    "",
    "So geht es weiter:",
    "  1. Das Büro des UHC Uster sendet dir die Rechnung mit den Zahlungsdetails",
    "     innerhalb weniger Werktage an diese E-Mail-Adresse.",
    `  2. Du überweist den Betrag und gibst dabei die Bestellnummer ${input.orderNumber}`,
    "     als Referenz an.",
    "  3. Sobald die Zahlung eingegangen ist, erhältst du deine Karte(n).",
    "",
    "Diese E-Mail bestätigt nur den Eingang deiner Bestellung - sie ist noch keine",
    "Rechnung. Bitte überweise noch nichts, bevor du die Rechnung erhalten hast.",
    "",
    "Bei Fragen kannst du direkt auf diese E-Mail antworten.",
    "",
    "Sportliche Grüsse",
    "UHC Uster",
  ].join("\n");
}

/** Inline styles and a single-column layout only - no external CSS, no images, no
 * float/flex/grid, since older desktop mail clients silently drop all of those. */
export function orderConfirmationHtml(input: OrderConfirmationEmailInput): string {
  const rows = input.items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #e5e5e5;color:#111111;">${escapeHtml(itemLabel(item))}</td>
          <td style="padding:8px 0;border-bottom:1px solid #e5e5e5;color:#111111;text-align:right;white-space:nowrap;">${escapeHtml(
            formatRappenAsChf(item.line_total_rappen)
          )}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="de">
<body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111111;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;">
    <tr>
      <td style="padding:32px;">
        <p style="margin:0 0 16px;font-size:16px;">Hallo ${escapeHtml(input.customerName)}</p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#444444;">
          Vielen Dank für deine Bestellung beim UHC Uster. Wir haben sie erhalten.
        </p>

        <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6b6b6b;">Bestellnummer</p>
        <p style="margin:0 0 24px;font-size:24px;font-weight:700;color:#e4032e;">${escapeHtml(input.orderNumber)}</p>

        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;border-collapse:collapse;">
          ${rows}
          <tr>
            <td style="padding:12px 0 0;font-weight:700;">Total</td>
            <td style="padding:12px 0 0;font-weight:700;text-align:right;white-space:nowrap;">${escapeHtml(
              formatRappenAsChf(input.totalRappen)
            )}</td>
          </tr>
        </table>

        <p style="margin:32px 0 8px;font-size:15px;font-weight:700;">So geht es weiter</p>
        <ol style="margin:0 0 24px;padding-left:20px;font-size:14px;line-height:1.7;color:#444444;">
          <li>Das Büro des UHC Uster sendet dir die Rechnung mit den Zahlungsdetails innerhalb weniger Werktage an diese E-Mail-Adresse.</li>
          <li>Du überweist den Betrag und gibst dabei die Bestellnummer <strong>${escapeHtml(
            input.orderNumber
          )}</strong> als Referenz an.</li>
          <li>Sobald die Zahlung eingegangen ist, erhältst du deine Karte(n).</li>
        </ol>

        <p style="margin:0 0 24px;padding:12px 16px;background:#fafafa;border-radius:8px;font-size:13px;line-height:1.6;color:#6b6b6b;">
          Diese E-Mail bestätigt nur den Eingang deiner Bestellung - sie ist noch keine Rechnung.
          Bitte überweise noch nichts, bevor du die Rechnung erhalten hast.
        </p>

        <p style="margin:0;font-size:14px;line-height:1.6;color:#444444;">
          Bei Fragen kannst du direkt auf diese E-Mail antworten.<br /><br />
          Sportliche Grüsse<br />UHC Uster
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
