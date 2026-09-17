import { getSupabaseServerClient } from "@/lib/supabase-server";
import { sendEmail, type EmailAttachment } from "@/lib/email/mailer";
import { recordSentEmail } from "@/lib/email/delivery";
import { cardMailHtml, cardMailText } from "@/lib/email/card-mail";
import { applyPlaceholders } from "@/lib/email/templates";
import { buildOrderAccessUrl } from "@/lib/orders/access-token";
import { ticketFileName, uniqueFileName } from "@/lib/tickets/label";
import { CURRENT_SEASON_LABEL } from "@/lib/season";
import { PRODUCT_CATEGORY_LABELS, type ProductCategory } from "@/lib/products";
import { runWithConcurrency } from "@/lib/concurrency";
import type { OrderStatus } from "@/lib/orders/visibility";

/**
 * The manual send from the orders tab (brief §4, "Manueller Versand"): the
 * office picks orders, a template, checks a preview, and sends - cards attached
 * and the durable link in the body, exactly like the member cards. Every
 * outcome lands on the order (set_order_notification), per recipient.
 *
 * A few recipients are handled at once, because most of the time per mail is
 * spent fetching its card PDFs rather than talking to the provider. Each one
 * still stands alone: its own record, its own mark on its own order, its own
 * reason when it fails. The pace against the provider's rate limit is kept in
 * the mailer, which is where the limit actually applies - it belongs to the API
 * key, not to this loop - so overlapping here cannot outrun it.
 */

/** Enough to keep the Storage fetches overlapping, few enough that a run does
 *  not hold a pile of PDFs in memory at once. */
const SEND_CONCURRENCY = 4;

export interface OrderSendRecipient {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  email: string;
  notificationStatus: "nicht_versendet" | "versendet" | "fehlgeschlagen";
  /** The values the placeholders resolve to for this order. */
  values: Record<string, string>;
  categoryLabel: string;
  tickets: Array<{
    id: string;
    pdfPath: string | null;
    holderName: string | null;
    transferable: boolean;
    transferableIndex: number | null;
    productName: string;
  }>;
}

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  notification_status: string;
  customers: { name: string; first_name: string | null; last_name: string | null; company_name: string | null; email: string } | null;
  order_items: Array<{
    product_name_snapshot: string;
    products: { category: string | null; variant: string | null } | null;
  }>;
  tickets: Array<{
    id: string;
    status: string;
    pdf_path: string | null;
    holder_name: string | null;
    transferable: boolean;
    transferable_index: number | null;
    order_items: { product_name_snapshot: string } | null;
  }>;
}

async function loadRecipients(orderIds: string[]): Promise<OrderSendRecipient[]> {
  if (orderIds.length === 0) return [];
  const supabase = await getSupabaseServerClient();

  const [{ data, error }, { data: catalog }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_number, status, notification_status, customers(name, first_name, last_name, company_name, email), order_items(product_name_snapshot, products(category, variant)), tickets(id, status, pdf_path, holder_name, transferable, transferable_index, order_items(product_name_snapshot))"
      )
      .in("id", orderIds)
      .returns<OrderRow[]>(),
    supabase.from("product_variant_catalog").select("category, variant, label"),
  ]);
  if (error) throw new Error(`Failed to load orders: ${error.message}`);

  const labels = new Map((catalog ?? []).map((row) => [`${row.category}/${row.variant}`, row.label as string]));

  return (data ?? []).map((row) => {
    const customer = row.customers;
    const firstItem = row.order_items[0];
    const product = firstItem?.products;
    const category = (product?.category as ProductCategory | null) ?? null;
    const variantLabel = product ? (labels.get(`${product.category}/${product.variant}`) ?? product.variant ?? "") : "";
    const person = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim() || customer?.name || "";

    return {
      id: row.id,
      orderNumber: row.order_number,
      status: row.status as OrderStatus,
      email: customer?.email ?? "",
      notificationStatus: row.notification_status as OrderSendRecipient["notificationStatus"],
      categoryLabel: category ? PRODUCT_CATEGORY_LABELS[category] : "Bestellung",
      values: {
        name: person,
        firma: customer?.company_name ?? "",
        bestellnummer: row.order_number,
        variante: variantLabel,
        ticket_link: buildOrderAccessUrl(row.order_number),
      },
      tickets: row.tickets
        .filter((ticket) => ticket.status === "gueltig" || ticket.status === "eingeloest")
        .sort((a, b) => Number(a.transferable) - Number(b.transferable) || (a.transferable_index ?? 0) - (b.transferable_index ?? 0))
        .map((ticket) => ({
          id: ticket.id,
          pdfPath: ticket.pdf_path,
          holderName: ticket.holder_name,
          transferable: ticket.transferable,
          transferableIndex: ticket.transferable_index,
          productName: ticket.order_items?.product_name_snapshot ?? firstItem?.product_name_snapshot ?? "Ticket",
        })),
    };
  });
}

export interface RenderedOrderMail {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  attachmentNames: string[];
}

function render(recipient: OrderSendRecipient, subjectTemplate: string, bodyTemplate: string): RenderedOrderMail {
  const bodyText = applyPlaceholders(bodyTemplate, recipient.values);
  const frame = { eyebrow: recipient.categoryLabel, bodyText, statusUrl: recipient.values.ticket_link, cardCount: recipient.tickets.length };
  const taken = new Map<string, number>();
  return {
    subject: applyPlaceholders(subjectTemplate, recipient.values),
    bodyText: cardMailText(frame),
    bodyHtml: cardMailHtml(frame),
    attachmentNames: recipient.tickets.map((ticket) =>
      uniqueFileName(
        ticketFileName(
          {
            productName: ticket.productName,
            kategorie: null,
            holderName: ticket.holderName,
            transferable: ticket.transferable,
            transferableIndex: ticket.transferableIndex,
          },
          CURRENT_SEASON_LABEL
        ),
        taken
      )
    ),
  };
}

async function loadAttachments(recipient: OrderSendRecipient, names: string[]): Promise<EmailAttachment[]> {
  const supabase = await getSupabaseServerClient();
  const attachments: EmailAttachment[] = [];
  for (const [index, ticket] of recipient.tickets.entries()) {
    if (!ticket.pdfPath) {
      // Better a visible failure than a mail one card short.
      throw new Error(`Karte ${names[index]} hat keine PDF hinterlegt.`);
    }
    const { data: file, error } = await supabase.storage.from("tickets").download(ticket.pdfPath);
    if (error || !file) throw new Error(`PDF ${ticket.pdfPath} konnte nicht geladen werden: ${error?.message}`);
    attachments.push({ filename: names[index], content: new Uint8Array(await file.arrayBuffer()) });
  }
  return attachments;
}

/** What one recipient would get - shown in the dialog before anything is sent. */
export async function previewOrderMail(orderId: string, subjectTemplate: string, bodyTemplate: string): Promise<RenderedOrderMail & { to: string }> {
  const [recipient] = await loadRecipients([orderId]);
  if (!recipient) throw new Error("Bestellung nicht gefunden.");
  return { ...render(recipient, subjectTemplate, bodyTemplate), to: recipient.email };
}

/** The real mail for one order, delivered to the admin instead of the customer.
 * Nothing is recorded on the order. */
export async function sendOrderTestMail(orderId: string, subjectTemplate: string, bodyTemplate: string, to: string): Promise<void> {
  const [recipient] = await loadRecipients([orderId]);
  if (!recipient) throw new Error("Bestellung nicht gefunden.");
  const mail = render(recipient, subjectTemplate, bodyTemplate);
  const attachments = await loadAttachments(recipient, mail.attachmentNames);
  const result = await sendEmail({
    to,
    subject: `[TEST] ${mail.subject}`,
    bodyText: mail.bodyText,
    bodyHtml: mail.bodyHtml,
    attachments,
  });
  if (!result.accepted) throw new Error("Testadresse ist nicht zustellbar (reservierte Domain).");
  // Recorded as a test: a bounce here must not reopen the customer's cards.
  await recordSentEmail({ messageId: result.messageId, kind: "test", recipient: to, subject: mail.subject });
}

export interface OrderSendResult {
  sent: number;
  skipped: Array<{ orderNumber: string; reason: string }>;
  failed: Array<{ orderNumber: string; email: string; reason: string }>;
}

/**
 * Sends to every selected order that qualifies. Orders already informed are
 * skipped unless the office asked for a repeat; a cancelled order or one
 * without live cards has nothing to send and is reported as skipped rather
 * than silently dropped.
 */
export async function sendOrderMails(
  subjectTemplate: string,
  bodyTemplate: string,
  orderIds: string[],
  options: { includeAlreadyNotified: boolean }
): Promise<OrderSendResult> {
  const result: OrderSendResult = { sent: 0, skipped: [], failed: [] };
  const recipients = await loadRecipients(orderIds);
  const supabase = await getSupabaseServerClient();

  await runWithConcurrency(recipients, SEND_CONCURRENCY, async (recipient) => {
    if (recipient.status === "storniert") {
      result.skipped.push({ orderNumber: recipient.orderNumber, reason: "Bestellung ist storniert." });
      return;
    }
    if (recipient.notificationStatus === "versendet" && !options.includeAlreadyNotified) {
      result.skipped.push({ orderNumber: recipient.orderNumber, reason: "Bereits informiert." });
      return;
    }
    if (recipient.tickets.length === 0) {
      result.skipped.push({ orderNumber: recipient.orderNumber, reason: "Keine aktiven Karten." });
      return;
    }

    try {
      const mail = render(recipient, subjectTemplate, bodyTemplate);
      const attachments = await loadAttachments(recipient, mail.attachmentNames);
      const sendResult = await sendEmail({
        to: recipient.email,
        subject: mail.subject,
        bodyText: mail.bodyText,
        bodyHtml: mail.bodyHtml,
        attachments,
      });
      if (!sendResult.accepted) throw new Error("Adresse ist nicht zustellbar (reservierte Domain).");

      await recordSentEmail({
        messageId: sendResult.messageId,
        kind: "order_info",
        recipient: recipient.email,
        subject: mail.subject,
        orderId: recipient.id,
        ticketIds: recipient.tickets.map((ticket) => ticket.id),
      });

      const { error } = await supabase.rpc("set_order_notification", { p_order_id: recipient.id, p_status: "versendet" });
      if (error) throw new Error(`Versendet, aber nicht vermerkt: ${error.message}`);
      result.sent++;
    } catch (sendError) {
      const reason = sendError instanceof Error ? sendError.message : "Unbekannter Fehler";
      result.failed.push({ orderNumber: recipient.orderNumber, email: recipient.email, reason });
      await supabase.rpc("set_order_notification", { p_order_id: recipient.id, p_status: "fehlgeschlagen", p_error: reason });
    }
  });

  return result;
}
