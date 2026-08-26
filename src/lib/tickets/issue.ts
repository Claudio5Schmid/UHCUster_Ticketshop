import { getSupabaseServerClient } from "@/lib/supabase-server";
import { generateTicketId } from "./token";
import { renderTicketPdf } from "./pdf";
import type { ProductBenefits } from "@/lib/products";

interface OrderItemForIssuance {
  id: string;
  product_id: string;
  quantity: number;
  holder_name: string | null;
  products: { name: string; type: "season_pass" | "membership"; tier_level: number; benefits: ProductBenefits } | null;
}

/**
 * Renders and stores one PDF per ticket for every item on a paid order, then
 * records the tickets via issue_tickets_for_order (docs/ARCHITECTURE.md #3: "on
 * transition to bezahlt"). Called from the order-status Server Action right after
 * transition_order_status succeeds - never automatically from anywhere else, so an
 * order can't accidentally get tickets before it's actually paid.
 *
 * PDFs are uploaded to Storage before the DB call, not after: if an upload fails
 * partway through, nothing is recorded in `tickets` yet, so there's no dangling
 * pdf_path pointing at a file that was never written. issue_tickets_for_order
 * itself also refuses a second call for the same order (see its own idempotency
 * check), so retrying after a failed upload is safe.
 */
export async function issueTicketsForOrder(orderId: string): Promise<{ issued: number }> {
  const supabase = await getSupabaseServerClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, season")
    .eq("id", orderId)
    .single();
  if (orderError || !order) {
    throw new Error(orderError?.message ?? `Order ${orderId} not found`);
  }

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("id, product_id, quantity, holder_name, products(name, type, tier_level, benefits)")
    .eq("order_id", orderId)
    .returns<OrderItemForIssuance[]>();
  if (itemsError) {
    throw new Error(itemsError.message);
  }
  if (!items || items.length === 0) {
    return { issued: 0 };
  }

  const ticketRows: Array<{
    id: string;
    order_item_id: string;
    product_id: string;
    season: string;
    holder_name: string | null;
    transferable: boolean;
    token: string;
    pdf_path: string;
  }> = [];
  const uploads: Array<{ path: string; bytes: Uint8Array }> = [];

  for (const item of items) {
    const product = item.products;
    if (!product) continue;
    const transferable = Boolean(product.benefits?.transferable);

    for (let i = 0; i < item.quantity; i++) {
      const { id, token } = generateTicketId();
      const pdfPath = `${order.season}/${id}.pdf`;
      const bytes = await renderTicketPdf({
        token,
        productName: product.name,
        productType: product.type,
        tierLevel: product.tier_level,
        benefits: product.benefits,
        holderName: item.holder_name,
        transferable,
        orderNumber: order.order_number,
      });

      uploads.push({ path: pdfPath, bytes });
      ticketRows.push({
        id,
        order_item_id: item.id,
        product_id: item.product_id,
        season: order.season,
        holder_name: item.holder_name,
        transferable,
        token,
        pdf_path: pdfPath,
      });
    }
  }

  for (const upload of uploads) {
    const { error: uploadError } = await supabase.storage.from("tickets").upload(upload.path, upload.bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) {
      throw new Error(`Failed to upload ${upload.path}: ${uploadError.message}`);
    }
  }

  const { error: issueError } = await supabase.rpc("issue_tickets_for_order", {
    p_order_id: orderId,
    p_tickets: ticketRows,
  });
  if (issueError) {
    throw new Error(issueError.message);
  }

  return { issued: ticketRows.length };
}
