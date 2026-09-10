import {
  PDFDocument,
  StandardFonts,
  rgb,
  setCharacterSpacing,
  setLineWidth,
  setStrokingColor,
  setTextRenderingMode,
  TextRenderingMode,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import QRCode from "qrcode";
import { readFile } from "fs/promises";
import path from "path";
import { getTicketAccentColor } from "@/lib/tier-colors";
import { ticketProductName, ticketTypeEyebrowSuffix } from "./label";
import { CURRENT_SEASON_LABEL, LEAGUE_LABEL } from "@/lib/season";
import type { ProductBenefits } from "@/lib/products";

export interface TicketPdfData {
  token: string;
  productName: string;
  productType: "season_pass" | "membership";
  tierLevel: number;
  /** Carried by every caller; the card no longer prints the highlights (D59), so
   * nothing here reads it - the interface stays stable for issue.ts and the
   * rerender script. */
  benefits: ProductBenefits;
  holderName: string | null;
  transferable: boolean;
  /** Running number among an order's transferable cards; null for personal ones. */
  transferableIndex?: number | null;
  orderNumber: string;
}

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;

/**
 * The card was designed on an A4 artboard at 96 CSS px per inch (794 px wide);
 * PDF points are 72 per inch, so every design measurement scales by exactly
 * 0.75. Keeping the design's px values in the code makes the two comparable.
 */
function px(value: number): number {
  return value * 0.75;
}

const MARGIN = px(56);
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CARD_RADIUS = px(24);
const STUB_WIDTH = px(236);

/** Helvetica's cap height as a fraction of the font size. Text is placed by the
 * top of its capitals, the way the design measures gaps. */
const CAP = 0.72;
/** Room left under a baseline for descenders when stacking lines upwards. */
const DESCENDER = 0.25;

const BLACK = rgb(0.067, 0.067, 0.067);
const WHITE = rgb(1, 1, 1);
const GREY = rgb(0.42, 0.42, 0.42);
const HAIRLINE = rgb(0.898, 0.898, 0.898); // #e5e5e5
const PERFORATION = rgb(0.831, 0.831, 0.831); // #d4d4d4

/** `color` laid over `base` at `alpha`. The design uses translucent whites and
 * accents on the black card; mixing them into solid colors here keeps every
 * PDF viewer rendering the same tone. */
function blend(color: RGB, base: RGB, alpha: number): RGB {
  return rgb(
    base.red + (color.red - base.red) * alpha,
    base.green + (color.green - base.green) * alpha,
    base.blue + (color.blue - base.blue) * alpha,
  );
}

const MUTED_ON_BLACK = blend(WHITE, BLACK, 0.64);

interface TextStyle {
  font: PDFFont;
  size: number;
  color: RGB;
  /** Letter-spacing in points, applied after every glyph. */
  tracking?: number;
}

type Align = "left" | "right" | "center";

/** Width as it will print: glyph advances plus the tracking between them. */
function textWidth(text: string, style: TextStyle): number {
  return style.font.widthOfTextAtSize(text, style.size) + (style.tracking ?? 0) * Math.max(text.length - 1, 0);
}

/** Draws `text` with the top of its capitals at `top`; returns the printed width. */
function drawText(page: PDFPage, text: string, x: number, top: number, style: TextStyle, align: Align = "left"): number {
  const width = textWidth(text, style);
  const startX = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
  const tracking = style.tracking ?? 0;
  if (tracking) page.pushOperators(setCharacterSpacing(tracking));
  page.drawText(text, { x: startX, y: top - style.size * CAP, size: style.size, font: style.font, color: style.color });
  if (tracking) page.pushOperators(setCharacterSpacing(0));
  return width;
}

/** Same as drawText, but only the glyph outlines are stroked - the design's
 * hollow season number behind the card's text. */
function drawOutlinedText(page: PDFPage, text: string, x: number, top: number, style: TextStyle, strokeWidth: number, align: Align) {
  page.pushOperators(setTextRenderingMode(TextRenderingMode.Outline), setStrokingColor(style.color), setLineWidth(strokeWidth));
  drawText(page, text, x, top, style, align);
  page.pushOperators(setTextRenderingMode(TextRenderingMode.Fill), setLineWidth(1));
}

/** Shrinks a value until it fits its column, so a long company name never runs
 * into the order number beside it. */
function fitted(text: string, style: TextStyle, maxWidth: number, minSize: number): TextStyle {
  let size = style.size;
  while (size > minSize && textWidth(text, { ...style, size }) > maxWidth) size -= 0.5;
  return { ...style, size };
}

function wrapText(text: string, style: TextStyle, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, style) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface Radii {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

/** An SVG path for drawSvgPath: origin top-left, y downwards (pdf-lib flips it). */
function roundedRectPath(width: number, height: number, r: Radii): string {
  const arc = (radius: number, x: number, y: number) => (radius ? `A ${radius} ${radius} 0 0 1 ${x} ${y}` : "");
  return [
    `M ${r.tl} 0`,
    `H ${width - r.tr}`,
    arc(r.tr, width, r.tr),
    `V ${height - r.br}`,
    arc(r.br, width - r.br, height),
    `H ${r.bl}`,
    arc(r.bl, 0, height - r.bl),
    `V ${r.tl}`,
    arc(r.tl, r.tl, 0),
    "Z",
  ].join(" ");
}

const uniform = (radius: number): Radii => ({ tl: radius, tr: radius, br: radius, bl: radius });

async function embedPublicPng(pdfDoc: PDFDocument, file: string) {
  return pdfDoc.embedPng(await readFile(path.join(process.cwd(), "public", file)));
}

/**
 * Renders one ticket as a single-page A4 PDF, after the "Editorial Pass" design
 * (D59): the club logo and season up top, then a black landscape card with the
 * card's name, holder and order number on the left and a tear-off stub with the
 * QR code on the right, separated by a perforation with die-cut notches. Below
 * the card, what the card is good for and how to use it; the human-readable
 * token under the QR code stays as the manual fallback at the door.
 *
 * Red Castle Club cards carry the club's own crest instead of the eyebrow, the
 * tier's metal tone (D29) on the badge, the stub and the tier word of the
 * title, and a tinted stub. Season passes stay on the site's red.
 *
 * Uses pdf-lib's standard Helvetica rather than the site's Inter webfont (D30);
 * the design's Inter 900 headline becomes Helvetica Bold in capitals.
 */
export async function renderTicketPdf(data: TicketPdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${data.productName} - UHC Uster`);
  pdfDoc.setProducer("UHC Uster Ticketshop");

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const colors = getTicketAccentColor(data.productType, data.tierLevel);
  const accent = rgb(...colors.accent);
  const tint = rgb(...colors.tint);
  const membership = data.productType === "membership";

  // --- Header: logo left, the season right, both on one centre line ---
  const logo = await embedPublicPng(pdfDoc, "uhc-uster-logo.png");
  const logoHeight = px(52);
  const logoWidth = (logo.width / logo.height) * logoHeight;
  const headerTop = PAGE_HEIGHT - MARGIN;
  page.drawImage(logo, { x: MARGIN, y: headerTop - logoHeight, width: logoWidth, height: logoHeight });

  const seasonLabelStyle: TextStyle = { font: fontBold, size: px(11), color: GREY, tracking: px(11) * 0.14 };
  const seasonStyle: TextStyle = { font: fontBold, size: px(28), color: BLACK, tracking: -px(28) * 0.03 };
  const seasonBlockHeight = seasonLabelStyle.size * CAP + px(4) + seasonStyle.size * CAP;
  let seasonTop = headerTop - (logoHeight - seasonBlockHeight) / 2;
  drawText(page, "SAISON", PAGE_WIDTH - MARGIN, seasonTop, seasonLabelStyle, "right");
  seasonTop -= seasonLabelStyle.size * CAP + px(4);
  drawText(page, CURRENT_SEASON_LABEL, PAGE_WIDTH - MARGIN, seasonTop, seasonStyle, "right");

  // --- The card: black body, stub on the right, perforation, notches ---
  const cardTop = headerTop - logoHeight - px(44);
  const cardHeight = membership ? px(480) : px(400);
  const cardBottom = cardTop - cardHeight;
  const stubX = MARGIN + CONTENT_WIDTH - STUB_WIDTH;
  const stubFill = membership ? tint : WHITE;

  page.drawSvgPath(roundedRectPath(CONTENT_WIDTH, cardHeight, uniform(CARD_RADIUS)), { x: MARGIN, y: cardTop, color: BLACK });
  page.drawSvgPath(roundedRectPath(STUB_WIDTH, cardHeight, { tl: 0, tr: CARD_RADIUS, br: CARD_RADIUS, bl: 0 }), {
    x: stubX,
    y: cardTop,
    color: stubFill,
  });
  // On screen the card has a shadow; on paper a hairline is what keeps the white
  // stub from dissolving into the page.
  page.drawSvgPath(roundedRectPath(CONTENT_WIDTH, cardHeight, uniform(CARD_RADIUS)), {
    x: MARGIN,
    y: cardTop,
    borderColor: HAIRLINE,
    borderWidth: 0.75,
  });
  page.drawLine({
    start: { x: stubX, y: cardTop },
    end: { x: stubX, y: cardBottom },
    thickness: px(2),
    color: membership ? blend(accent, tint, 0.6) : PERFORATION,
    dashArray: [px(6), px(6)],
  });
  for (const y of [cardTop, cardBottom]) {
    page.drawCircle({ x: stubX, y, size: px(14), color: WHITE });
  }

  // --- Left panel ---
  const panelX = MARGIN + px(36);
  const panelRight = stubX - px(32);
  const panelWidth = panelRight - panelX;
  let cursor = cardTop - px(36);

  // Every card says in its top row whether it may change hands: a pill on the
  // right, in the accent for a transferable card and muted for a personal one.
  const badgeText = data.transferable ? (ticketTypeEyebrowSuffix(data.transferableIndex) ?? "ÜBERTRAGBAR") : "NICHT ÜBERTRAGBAR";
  const badgeStyle: TextStyle = { font: fontBold, size: px(10), color: data.transferable ? accent : MUTED_ON_BLACK, tracking: px(10) * 0.1 };
  const badgeWidth = textWidth(badgeText, badgeStyle) + px(20);
  const badgeHeight = px(18);
  const drawBadge = (rowTop: number, rowHeight: number) => {
    const badgeTop = rowTop - (rowHeight - badgeHeight) / 2;
    page.drawSvgPath(roundedRectPath(badgeWidth, badgeHeight, uniform(badgeHeight / 2)), {
      x: panelRight - badgeWidth,
      y: badgeTop,
      borderColor: badgeStyle.color,
      borderWidth: 0.75,
    });
    drawText(page, badgeText, panelRight - badgeWidth + px(10), badgeTop - (badgeHeight - badgeStyle.size * CAP) / 2, badgeStyle);
  };

  if (membership) {
    // The club's crest where a season pass has its eyebrow.
    const crest = await embedPublicPng(pdfDoc, "red-castle-club-logo.png");
    const crestHeight = px(34);
    const crestWidth = (crest.width / crest.height) * crestHeight;
    page.drawImage(crest, { x: panelX, y: cursor - crestHeight, width: crestWidth, height: crestHeight });
    drawBadge(cursor, crestHeight);
    cursor -= crestHeight + px(18);
  } else {
    const eyebrowStyle: TextStyle = { font: fontBold, size: px(12), color: accent, tracking: px(12) * 0.14 };
    drawText(page, `SAISONKARTE · ${LEAGUE_LABEL}`, panelX, cursor - (badgeHeight - eyebrowStyle.size * CAP) / 2, eyebrowStyle);
    drawBadge(cursor, badgeHeight);
    cursor -= badgeHeight + px(16);
  }

  // Title: the product name in capitals, wrapped like the design's headline. A
  // Red Castle Club tier word ("GOLD") takes the tier's metal. The transferable
  // member product's own "(übertragbar)" comes off: the eyebrow's running number
  // and the note under the holder already say it, and the headline has no room
  // for a third line.
  const titleStyle: TextStyle = { font: fontBold, size: px(46), color: WHITE, tracking: -px(46) * 0.02 };
  const titleLineHeight = titleStyle.size * 0.98;
  const titleLines = wrapText(ticketProductName(data.productName).toUpperCase(), titleStyle, px(380));
  const metal = colors.metalName?.toUpperCase() ?? null;
  titleLines.forEach((line, index) => {
    const last = index === titleLines.length - 1;
    if (metal && last && line === metal) {
      drawText(page, line, panelX, cursor, { ...titleStyle, color: accent });
    } else if (metal && last && line.endsWith(` ${metal}`)) {
      const prefix = line.slice(0, -metal.length);
      const prefixWidth = drawText(page, prefix, panelX, cursor, titleStyle);
      drawText(page, metal, panelX + prefixWidth + (titleStyle.tracking ?? 0), cursor, { ...titleStyle, color: accent });
    } else {
      drawText(page, line, panelX, cursor, titleStyle);
    }
    cursor -= titleLineHeight;
  });
  const titleBottom = cursor + titleLineHeight - titleStyle.size * CAP;

  // Holder and order number, stacked up from the card's bottom edge.
  const noteStyle: TextStyle = { font, size: px(12), color: MUTED_ON_BLACK };
  const fieldLabelStyle: TextStyle = { font: fontBold, size: px(11), color: MUTED_ON_BLACK, tracking: px(11) * 0.12 };
  const fieldValueStyle: TextStyle = { font: fontBold, size: px(20), color: WHITE };
  const noteTop = cardBottom + px(32) + noteStyle.size * DESCENDER + noteStyle.size * CAP;
  const valueTop = noteTop + px(22) + fieldValueStyle.size * DESCENDER + fieldValueStyle.size * CAP;
  const labelTop = valueTop + px(6) + fieldLabelStyle.size * CAP;
  const columnWidth = (panelWidth - px(24)) / 2;
  const secondColumnX = panelX + columnWidth + px(24);

  const holderName = data.holderName ?? "-";
  drawText(page, data.transferable ? "FIRMA / GRUPPE" : "INHABER", panelX, labelTop, fieldLabelStyle);
  drawText(page, holderName, panelX, valueTop, fitted(holderName, fieldValueStyle, columnWidth, px(13)));
  drawText(page, "BESTELLUNG", secondColumnX, labelTop, fieldLabelStyle);
  drawText(page, data.orderNumber, secondColumnX, valueTop, fitted(data.orderNumber, fieldValueStyle, columnWidth, px(13)));

  const transferNote = data.transferable
    ? data.transferableIndex
      ? `Übertragbare Karte ${data.transferableIndex} · kann an eine beliebige Person weitergegeben werden`
      : "Übertragbar · kann an eine beliebige Person weitergegeben werden"
    : "Nicht übertragbar · nur für die genannte Person gültig";
  drawText(page, transferNote, panelX, noteTop, fitted(transferNote, noteStyle, panelWidth, px(10)));

  // The hollow season number sits in whatever band is left between the title
  // and the holder line; a three-line product name may leave none, and then
  // the card simply goes without.
  const ghostStyle: TextStyle = {
    font: fontBold,
    size: px(104),
    color: membership ? blend(accent, BLACK, 0.5) : blend(WHITE, BLACK, 0.3),
    tracking: -px(104) * 0.06,
  };
  // The slash in "26/27" hangs below the baseline, so the number is taller than
  // its capitals.
  const ghostHeight = ghostStyle.size * (CAP + 0.12);
  const band = titleBottom - labelTop;
  if (band >= ghostHeight + px(24)) {
    const ghostTop = titleBottom - (band - ghostHeight) / 2;
    drawOutlinedText(page, CURRENT_SEASON_LABEL, panelRight + px(4), ghostTop, ghostStyle, px(1.5), "right");
  }

  // --- Stub: label up top, the token and instruction at the bottom, QR between ---
  const stubCenter = stubX + STUB_WIDTH / 2;
  const stubLabelStyle: TextStyle = { font: fontBold, size: px(11), color: membership ? accent : GREY, tracking: px(11) * 0.14 };
  const stubTop = cardTop - px(30);
  drawText(page, membership ? "VIP-EINLASS" : "EINLASS", stubCenter, stubTop, stubLabelStyle, "center");

  const tokenStyle: TextStyle = { font: fontMono, size: px(10), color: GREY, tracking: px(10) * 0.06 };
  const showStyle: TextStyle = { font: fontBold, size: px(14), color: BLACK };
  const tokenTop = cardBottom + px(28) + tokenStyle.size * DESCENDER + tokenStyle.size * CAP;
  const showTop = tokenTop + px(8) + showStyle.size * DESCENDER + showStyle.size * CAP;
  drawText(page, data.token, stubCenter, tokenTop, tokenStyle, "center");
  drawText(page, "Am Einlass vorzeigen", stubCenter, showTop, showStyle, "center");

  const qrDataUrl = await QRCode.toDataURL(data.token, { margin: 0, width: 300 });
  const qrImage = await pdfDoc.embedPng(Buffer.from(qrDataUrl.split(",")[1], "base64"));
  // On the tinted club stub the code sits in its own white box, so the scanner
  // always sees a clean quiet zone.
  const qrSize = membership ? px(150) : px(160);
  const boxSize = membership ? qrSize + px(20) : qrSize;
  const spaceTop = stubTop - stubLabelStyle.size * CAP;
  const boxTop = spaceTop - (spaceTop - showTop - boxSize) / 2;
  if (membership) {
    page.drawSvgPath(roundedRectPath(boxSize, boxSize, uniform(px(12))), { x: stubCenter - boxSize / 2, y: boxTop, color: WHITE });
  }
  page.drawImage(qrImage, {
    x: stubCenter - qrSize / 2,
    y: boxTop - (boxSize - qrSize) / 2 - qrSize,
    width: qrSize,
    height: qrSize,
  });

  // --- Below the card: what it is good for, and how to use it ---
  const blocksTop = cardBottom - px(44) - px(8);
  const blockWidth = (CONTENT_WIDTH - px(40)) / 2;
  const blockLabelStyle: TextStyle = { font: fontBold, size: px(11), color: GREY, tracking: px(11) * 0.14 };
  const blockBodyStyle: TextStyle = { font, size: px(16), color: BLACK };
  const blocks = [
    {
      x: MARGIN,
      rule: BLACK,
      label: "GÜLTIGKEIT",
      text: `Zutritt zu allen Heimspielen des UHC Uster in der Saison ${CURRENT_SEASON_LABEL}.`,
    },
    {
      x: MARGIN + blockWidth + px(40),
      rule: accent,
      label: "SO GEHT'S",
      text: "Zeig den QR-Code am Eingang direkt auf dem Handy oder ausgedruckt vor.",
    },
  ];
  for (const block of blocks) {
    page.drawRectangle({ x: block.x, y: blocksTop - px(3), width: blockWidth, height: px(3), color: block.rule });
    let top = blocksTop - px(3) - px(16);
    drawText(page, block.label, block.x, top, blockLabelStyle);
    top -= blockLabelStyle.size * CAP + px(10);
    for (const line of wrapText(block.text, blockBodyStyle, blockWidth)) {
      drawText(page, line, block.x, top, blockBodyStyle);
      top -= blockBodyStyle.size * 1.5;
    }
  }

  // --- Footer ---
  const footerTop = MARGIN + px(12) * CAP;
  drawText(page, "UHC USTER", MARGIN, footerTop, { font: fontBold, size: px(12), color: BLACK, tracking: px(12) * 0.06 });
  drawText(page, `Gültig für alle Heimspiele der Saison ${CURRENT_SEASON_LABEL}`, PAGE_WIDTH - MARGIN, footerTop, { font, size: px(12), color: GREY }, "right");

  return pdfDoc.save();
}
