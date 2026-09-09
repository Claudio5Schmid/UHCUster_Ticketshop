/**
 * One-off, idempotent: re-renders every stored ticket PDF in place so the cards
 * issued before running numbers existed carry theirs too.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/rerender-ticket-pdfs.ts          # dry run
 *   npx tsx --env-file=.env.local scripts/rerender-ticket-pdfs.ts --write  # actually upload
 *
 * (tsx rather than plain node because this imports the app's own renderer
 * through the "@/" alias; nothing in the repo depends on it otherwise.)
 *
 * What it does NOT change: the ticket id, its token, its path, or therefore the
 * QR code. Every card stays valid and nobody has to be told anything. The PDF a
 * member already has in their inbox also stays as it is - only a fresh download
 * shows the number.
 *
 * Uses the service-role key, like scripts/playwright-create-test-admin.mjs, so
 * it bypasses Storage policies. That is deliberate: granting every logged-in
 * admin a standing right to overwrite ticket PDFs would widen what a stolen
 * session can do, for a job that runs once.
 */
import { createClient } from "@supabase/supabase-js";
import { renderTicketPdf } from "@/lib/tickets/pdf";
import type { ProductBenefits } from "@/lib/products";

interface TicketRow {
  id: string;
  token: string;
  holder_name: string | null;
  transferable: boolean;
  transferable_index: number | null;
  pdf_path: string;
  products: { name: string; type: "season_pass" | "membership"; tier_level: number; benefits: ProductBenefits } | null;
  orders: { order_number: string } | null;
}

// Wrapped in a function because package.json has no "type": "module", so this
// file is transformed as CommonJS, where top-level await is not available.
async function main() {
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.");
  process.exit(1);
}

const write = process.argv.includes("--write");
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const { data, error } = await supabase
  .from("tickets")
  .select("id, token, holder_name, transferable, transferable_index, pdf_path, products(name, type, tier_level, benefits), orders(order_number)")
  .not("pdf_path", "is", null)
  .order("issued_at", { ascending: true })
  .returns<TicketRow[]>();

if (error) {
  console.error(`Tickets konnten nicht geladen werden: ${error.message}`);
  process.exit(1);
}

const tickets = data ?? [];
console.log(`${tickets.length} Ticket(s) mit PDF gefunden.${write ? "" : " (Trockenlauf - nichts wird geschrieben)"}`);

let rendered = 0;
const failures: string[] = [];

for (const ticket of tickets) {
  if (!ticket.products) {
    failures.push(`${ticket.id}: kein Produkt hinterlegt`);
    continue;
  }

  try {
    const bytes = await renderTicketPdf({
      token: ticket.token,
      productName: ticket.products.name,
      productType: ticket.products.type,
      tierLevel: ticket.products.tier_level,
      benefits: ticket.products.benefits,
      holderName: ticket.holder_name,
      transferable: ticket.transferable,
      transferableIndex: ticket.transferable_index,
      orderNumber: ticket.orders?.order_number ?? "-",
    });

    if (write) {
      const { error: uploadError } = await supabase.storage
        .from("tickets")
        .upload(ticket.pdf_path, bytes, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw new Error(uploadError.message);
    }

    rendered++;
    const label = ticket.transferable_index ? `übertragbar-${ticket.transferable_index}` : ticket.transferable ? "übertragbar" : "persönlich";
    console.log(`  ${write ? "geschrieben" : "gerendert"}: ${ticket.pdf_path} (${label})`);
  } catch (renderError) {
    failures.push(`${ticket.id}: ${renderError instanceof Error ? renderError.message : "Unbekannter Fehler"}`);
  }
}

console.log(`\n${rendered} von ${tickets.length} erfolgreich.`);
if (failures.length > 0) {
  console.log(`${failures.length} fehlgeschlagen:`);
  for (const failure of failures) console.log(`  ${failure}`);
}
if (!write) {
  console.log("\nZum tatsächlichen Schreiben nochmal mit --write ausführen.");
}
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
