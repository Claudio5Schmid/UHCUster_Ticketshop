import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { readFile } from "fs/promises";
import path from "path";
import { getTicketAccentColor } from "./tier-colors";
import { CURRENT_SEASON_LABEL } from "@/lib/season";
import type { ProductBenefits } from "@/lib/products";

export interface TicketPdfData {
  token: string;
  productName: string;
  productType: "season_pass" | "membership";
  tierLevel: number;
  benefits: ProductBenefits;
  holderName: string | null;
  transferable: boolean;
  orderNumber: string;
}

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawCenteredText(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = rgb(0.067, 0.067, 0.067)) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE_WIDTH - width) / 2, y, size, font, color });
}

/** Renders one ticket as a single-page A4 PDF: a card-style pass with a QR code
 * and the human-readable token below it as a manual fallback. Red Castle Club
 * tiers 2-4 get a real metal accent (D29); everything else stays on the site's
 * plain red. Uses pdf-lib's standard Helvetica rather than the site's Inter
 * webfont (D30) - no static Inter TTFs to embed, and Helvetica reads as the same
 * family of clean sans-serif. */
export async function renderTicketPdf(data: TicketPdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${data.productName} - UHC Uster`);
  pdfDoc.setProducer("UHC Uster Ticketshop");

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const colors = getTicketAccentColor(data.productType, data.tierLevel);
  const accentColor = rgb(...colors.accent);
  const tintColor = rgb(...colors.tint);
  const black = rgb(0.067, 0.067, 0.067);
  const grey = rgb(0.42, 0.42, 0.42);

  // --- Header: logo + season label ---
  const logoBytes = await readFile(path.join(process.cwd(), "public", "uhc-uster-logo.png"));
  const logoImage = await pdfDoc.embedPng(logoBytes);
  const logoWidth = 130;
  const logoHeight = (logoImage.height / logoImage.width) * logoWidth;
  const headerTop = PAGE_HEIGHT - MARGIN;
  page.drawImage(logoImage, { x: MARGIN, y: headerTop - logoHeight, width: logoWidth, height: logoHeight });

  const seasonLabel = `Saison ${CURRENT_SEASON_LABEL}`;
  const seasonLabelWidth = font.widthOfTextAtSize(seasonLabel, 11);
  page.drawText(seasonLabel, {
    x: PAGE_WIDTH - MARGIN - seasonLabelWidth,
    y: headerTop - logoHeight / 2 - 4,
    size: 11,
    font,
    color: grey,
  });

  // --- Card ---
  // Every gap below is a named constant used identically in the height sum and the
  // draw walk, so the two can never drift apart (the earlier version computed the
  // card's height by a different, looser sum than what it actually drew - highlight
  // text that wrapped to two lines then overran the card and collided with the
  // transfer note beneath it).
  const highlights = data.benefits.highlights ?? [];
  const showHighlights = data.productType === "membership" && highlights.length > 0;
  const cardTop = headerTop - logoHeight - 32;
  const cardPadding = 28;
  const stripeHeight = 8;
  const highlightLineHeight = 14;
  const highlightLines = highlights.flatMap((highlight) => wrapText(`·  ${highlight}`, font, 10, contentWidth - cardPadding * 2));

  const GAP_TOP_TO_EYEBROW = cardPadding;
  const GAP_EYEBROW_TO_TITLE = 26;
  const GAP_TITLE_TO_DIVIDER = 30;
  const GAP_DIVIDER_TO_LABELS = 22;
  const GAP_LABELS_TO_VALUES = 15;
  const GAP_VALUES_TO_NEXT = 24;
  const GAP_HIGHLIGHTS_LABEL_TO_LINES = 15;
  const GAP_BEFORE_TRANSFER_NOTE = 16;

  let contentHeight =
    GAP_TOP_TO_EYEBROW +
    GAP_EYEBROW_TO_TITLE +
    GAP_TITLE_TO_DIVIDER +
    GAP_DIVIDER_TO_LABELS +
    GAP_LABELS_TO_VALUES +
    GAP_VALUES_TO_NEXT;
  if (showHighlights) {
    contentHeight += GAP_HIGHLIGHTS_LABEL_TO_LINES + highlightLines.length * highlightLineHeight;
  }
  contentHeight += GAP_BEFORE_TRANSFER_NOTE + cardPadding;

  const estimatedCardHeight = stripeHeight + contentHeight;
  const cardBottom = cardTop - estimatedCardHeight;

  page.drawRectangle({ x: MARGIN, y: cardBottom, width: contentWidth, height: estimatedCardHeight, color: tintColor });
  page.drawRectangle({ x: MARGIN, y: cardTop - stripeHeight, width: contentWidth, height: stripeHeight, color: accentColor });

  let cursorY = cardTop - stripeHeight - GAP_TOP_TO_EYEBROW;

  const eyebrow =
    data.productType === "membership"
      ? colors.metalName
        ? `RED CASTLE CLUB · ${colors.metalName.toUpperCase()}`
        : "RED CASTLE CLUB"
      : "SAISONKARTE";
  page.drawText(eyebrow, { x: MARGIN + cardPadding, y: cursorY, size: 10, font: fontBold, color: accentColor });
  cursorY -= GAP_EYEBROW_TO_TITLE;

  page.drawText(data.productName, { x: MARGIN + cardPadding, y: cursorY, size: 22, font: fontBold, color: black });
  cursorY -= GAP_TITLE_TO_DIVIDER;

  page.drawLine({
    start: { x: MARGIN + cardPadding, y: cursorY },
    end: { x: PAGE_WIDTH - MARGIN - cardPadding, y: cursorY },
    thickness: 0.75,
    color: rgb(0.85, 0.85, 0.85),
  });
  cursorY -= GAP_DIVIDER_TO_LABELS;

  const holderLabel = data.transferable ? "FIRMA / GRUPPE" : "INHABER";
  const columnWidth = contentWidth / 2;
  page.drawText(holderLabel, { x: MARGIN + cardPadding, y: cursorY, size: 8.5, font: fontBold, color: grey });
  page.drawText("BESTELLUNG", { x: MARGIN + cardPadding + columnWidth, y: cursorY, size: 8.5, font: fontBold, color: grey });
  cursorY -= GAP_LABELS_TO_VALUES;
  page.drawText(data.holderName ?? "-", { x: MARGIN + cardPadding, y: cursorY, size: 12, font, color: black });
  page.drawText(data.orderNumber, { x: MARGIN + cardPadding + columnWidth, y: cursorY, size: 12, font, color: black });
  cursorY -= GAP_VALUES_TO_NEXT;

  if (showHighlights) {
    page.drawText("VORTEILE", { x: MARGIN + cardPadding, y: cursorY, size: 8.5, font: fontBold, color: grey });
    cursorY -= GAP_HIGHLIGHTS_LABEL_TO_LINES;
    for (const line of highlightLines) {
      page.drawText(line, { x: MARGIN + cardPadding, y: cursorY, size: 10, font, color: black });
      cursorY -= highlightLineHeight;
    }
  }

  cursorY -= GAP_BEFORE_TRANSFER_NOTE;
  const transferNote = data.transferable
    ? "Übertragbar - kann an eine beliebige Person weitergegeben werden."
    : "Nicht übertragbar - nur für die genannte Person gültig.";
  page.drawText(transferNote, { x: MARGIN + cardPadding, y: cursorY, size: 8.5, font, color: grey });

  // --- QR code + token fallback ---
  const qrDataUrl = await QRCode.toDataURL(data.token, { margin: 0, width: 300 });
  const qrPngBytes = Buffer.from(qrDataUrl.split(",")[1], "base64");
  const qrImage = await pdfDoc.embedPng(qrPngBytes);
  const qrSize = 150;
  const qrY = cardBottom - 48 - qrSize;
  page.drawImage(qrImage, { x: (PAGE_WIDTH - qrSize) / 2, y: qrY, width: qrSize, height: qrSize });

  drawCenteredText(page, data.token, qrY - 22, font, 10, grey);
  drawCenteredText(page, "Am Einlass vorzeigen", qrY - 40, font, 9, grey);

  // --- Footer ---
  drawCenteredText(page, `UHC Uster · Gültig für alle Heimspiele der Saison ${CURRENT_SEASON_LABEL}`, MARGIN, font, 9, grey);

  return pdfDoc.save();
}
