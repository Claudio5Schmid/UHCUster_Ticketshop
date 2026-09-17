import { getOrders, type OrderFilters, type OrderListItem } from "@/lib/admin/orders";
import { PRODUCT_CATEGORY_LABELS } from "@/lib/products";

/**
 * The invoice data of the listed orders as a CSV (brief §2.5): what the office
 * types into the accounting software, one row per order, in the column order
 * an invoice form asks for it. Semicolon-separated like the FIBU export, so
 * Excel under Swiss settings opens it without a wizard.
 */

const HEADER = [
  "Bestellnummer",
  "Bestelldatum",
  "Status",
  "Rechnungsadresse",
  "Firma",
  "Kontaktperson",
  "Strasse",
  "PLZ",
  "Ort",
  "E-Mail",
  "Telefon",
  "Referenz/PO",
  "Produkt",
  "Variante",
  "Anzahl Karten",
  "Betrag CHF",
  "Zahlungsfrist",
  "Rechnungsnummer",
  "Externe Referenz",
  "Quelle",
];

const dateFormatter = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium" });

function csvEscape(value: string | null | undefined): string {
  const text = value ?? "";
  if (text.includes(";") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function invoiceRow(order: OrderListItem): string[] {
  const person = [order.first_name, order.last_name].filter(Boolean).join(" ");
  return [
    order.order_number,
    dateFormatter.format(new Date(order.created_at)),
    order.status,
    order.customer_name,
    order.company_name ?? "",
    order.company_name ? person : "",
    order.address_street ?? "",
    order.address_zip ?? "",
    order.address_city ?? "",
    order.customer_email,
    order.phone ?? "",
    order.customer_reference ?? "",
    order.category ? PRODUCT_CATEGORY_LABELS[order.category] : order.product_name,
    order.variant_label ?? order.variant ?? "",
    String(order.quantity),
    (order.total_rappen / 100).toFixed(2),
    "30 Tage netto",
    order.invoice_number ?? "",
    order.external_ref ?? "",
    order.source === "shop" ? "Shop" : "Import",
  ];
}

export async function buildInvoiceCsv(filters: OrderFilters): Promise<string> {
  const orders = await getOrders(filters);
  const lines = [HEADER.join(";"), ...orders.map((order) => invoiceRow(order).map(csvEscape).join(";"))];
  // A BOM, so Excel reads the umlauts as UTF-8 instead of guessing Windows-1252.
  return "﻿" + lines.join("\r\n");
}
