import { getSupabaseServerClient } from "@/lib/supabase-server";
import { generateTicketId } from "./token";
import { renderTicketPdf } from "./pdf";
import type { ProductBenefits } from "@/lib/products";

/**
 * The two zero-price products a club member's cards are issued against. Named
 * here because add_member_tickets refuses anything else - the database fence
 * that keeps "top up a member's cards" from ever reaching a paid shop order.
 */
export const MEMBER_PRODUCT_SLUGS = {
  personal: "mitglieder-uhc-uster",
  transferable: "mitglieder-uhc-uster-uebertragbar",
} as const;

interface ProductForIssuance {
  name: string;
  type: "season_pass" | "membership";
  tier_level: number;
  benefits: ProductBenefits;
}

interface OrderItemForIssuance {
  id: string;
  product_id: string;
  quantity: number;
  holder_name: string | null;
  products: ProductForIssuance | null;
}

interface TicketSpec {
  /** Null on the top-up path, where the database resolves the line item itself. */
  orderItemId: string | null;
  productId: string;
  product: ProductForIssuance;
  holderName: string | null;
  transferable: boolean;
  transferableIndex: number | null;
  season: string;
  orderNumber: string;
}

interface BuiltTicket {
  id: string;
  token: string;
  pdfPath: string;
  bytes: Uint8Array;
  row: Record<string, unknown>;
}

/**
 * Mints an id and token, renders the card, and shapes the row - no I/O against
 * Supabase, so a caller can build a whole batch before anything is written.
 */
async function buildTicket(spec: TicketSpec): Promise<BuiltTicket> {
  const { id, token } = generateTicketId();
  const pdfPath = `${spec.season}/${id}.pdf`;

  const bytes = await renderTicketPdf({
    token,
    productName: spec.product.name,
    productType: spec.product.type,
    tierLevel: spec.product.tier_level,
    benefits: spec.product.benefits,
    holderName: spec.holderName,
    transferable: spec.transferable,
    transferableIndex: spec.transferableIndex,
    orderNumber: spec.orderNumber,
  });

  return {
    id,
    token,
    pdfPath,
    bytes,
    row: {
      id,
      ...(spec.orderItemId ? { order_item_id: spec.orderItemId } : {}),
      product_id: spec.productId,
      season: spec.season,
      holder_name: spec.holderName,
      transferable: spec.transferable,
      transferable_index: spec.transferableIndex,
      token,
      pdf_path: pdfPath,
    },
  };
}

type SupabaseClient = Awaited<ReturnType<typeof getSupabaseServerClient>>;

/**
 * Every path uploads before it records, so a failure part-way through leaves no
 * `pdf_path` pointing at a file that was never written.
 *
 * The mirror case is tolerated and always has been: an upload that succeeded
 * followed by a failed database call leaves an unreferenced PDF in Storage,
 * which - the bucket having no delete policy - nobody can clear up. It is
 * harmless, because every path is keyed by a freshly minted ticket id, so a
 * retry writes to a new path and `upsert: false` keeps it from colliding.
 */
async function uploadAll(supabase: SupabaseClient, built: BuiltTicket[]): Promise<void> {
  for (const ticket of built) {
    const { error } = await supabase.storage.from("tickets").upload(ticket.pdfPath, ticket.bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (error) {
      throw new Error(`Failed to upload ${ticket.pdfPath}: ${error.message}`);
    }
  }
}

/**
 * Renders and stores one PDF per ticket for every item on a paid order, then
 * records the tickets via issue_tickets_for_order (docs/ARCHITECTURE.md #3: "on
 * transition to bezahlt"). Called from the order-status Server Action right after
 * transition_order_status succeeds - never automatically from anywhere else, so an
 * order can't accidentally get tickets before it's actually paid.
 *
 * issue_tickets_for_order refuses a second call for the same order, so retrying
 * after a failed upload is safe. Adding cards to an order that already has some
 * is deliberately NOT this function's job - see addMemberTickets.
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

  // Counted across the whole order rather than per line item: a customer with
  // two transferable line items must not end up holding two "übertragbar-1".
  let nextTransferableIndex = 1;
  const specs: TicketSpec[] = [];

  for (const item of items) {
    const product = item.products;
    if (!product) continue;
    const transferable = Boolean(product.benefits?.transferable);

    for (let i = 0; i < item.quantity; i++) {
      specs.push({
        orderItemId: item.id,
        productId: item.product_id,
        product,
        holderName: item.holder_name,
        transferable,
        transferableIndex: transferable ? nextTransferableIndex++ : null,
        season: order.season,
        orderNumber: order.order_number,
      });
    }
  }

  const built = await Promise.all(specs.map((spec) => buildTicket(spec)));
  await uploadAll(supabase, built);

  const { error: issueError } = await supabase.rpc("issue_tickets_for_order", {
    p_order_id: orderId,
    p_tickets: built.map((ticket) => ticket.row),
  });
  if (issueError) {
    throw new Error(issueError.message);
  }

  return { issued: built.length };
}

/**
 * Adds cards to a member's order that already has some - the correction path for
 * a typo in the member list, or a member who turns out to need one more code.
 *
 * Numbering continues from the highest running number the order has ever used,
 * including numbers held by deactivated cards: reusing one would put two
 * different QR codes behind the same "übertragbar-3".
 */
export async function addMemberTickets(
  orderId: string,
  counts: { personal: number; transferable: number },
  holderName?: string | null
): Promise<{ issued: number }> {
  const personal = Math.max(0, Math.trunc(counts.personal));
  const transferable = Math.max(0, Math.trunc(counts.transferable));
  if (personal + transferable === 0) {
    return { issued: 0 };
  }

  const supabase = await getSupabaseServerClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, season, customers(name)")
    .eq("id", orderId)
    .single<{ id: string; order_number: string; season: string; customers: { name: string } | null }>();
  if (orderError || !order) {
    throw new Error(orderError?.message ?? `Order ${orderId} not found`);
  }

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, slug, name, type, tier_level, benefits")
    .in("slug", [MEMBER_PRODUCT_SLUGS.personal, MEMBER_PRODUCT_SLUGS.transferable])
    .returns<Array<ProductForIssuance & { id: string; slug: string }>>();
  if (productsError) {
    throw new Error(productsError.message);
  }

  const personalProduct = products?.find((product) => product.slug === MEMBER_PRODUCT_SLUGS.personal);
  const transferableProduct = products?.find((product) => product.slug === MEMBER_PRODUCT_SLUGS.transferable);
  if (personal > 0 && !personalProduct) {
    throw new Error(`Product ${MEMBER_PRODUCT_SLUGS.personal} not found`);
  }
  if (transferable > 0 && !transferableProduct) {
    throw new Error(`Product ${MEMBER_PRODUCT_SLUGS.transferable} not found`);
  }

  const { data: highest, error: highestError } = await supabase
    .from("tickets")
    .select("transferable_index")
    .eq("order_id", orderId)
    .not("transferable_index", "is", null)
    .order("transferable_index", { ascending: false })
    .limit(1)
    .maybeSingle<{ transferable_index: number }>();
  if (highestError) {
    throw new Error(highestError.message);
  }

  const holder = holderName?.trim() || order.customers?.name || null;
  let nextTransferableIndex = (highest?.transferable_index ?? 0) + 1;
  const specs: TicketSpec[] = [];

  for (let i = 0; i < personal; i++) {
    specs.push({
      orderItemId: null,
      productId: personalProduct!.id,
      product: personalProduct!,
      holderName: holder,
      transferable: false,
      transferableIndex: null,
      season: order.season,
      orderNumber: order.order_number,
    });
  }
  for (let i = 0; i < transferable; i++) {
    specs.push({
      orderItemId: null,
      productId: transferableProduct!.id,
      product: transferableProduct!,
      holderName: holder,
      transferable: true,
      transferableIndex: nextTransferableIndex++,
      season: order.season,
      orderNumber: order.order_number,
    });
  }

  const built = await Promise.all(specs.map((spec) => buildTicket(spec)));
  await uploadAll(supabase, built);

  // The line item each ticket belongs to is resolved inside the function, so
  // nothing is written to the database until every upload has succeeded.
  const { error: addError } = await supabase.rpc("add_member_tickets", {
    p_order_id: orderId,
    p_tickets: built.map((ticket) => ticket.row),
  });
  if (addError) {
    throw new Error(addError.message);
  }

  return { issued: built.length };
}

interface TicketForRegeneration {
  id: string;
  product_id: string;
  holder_name: string | null;
  transferable: boolean;
  transferable_index: number | null;
  season: string;
  status: string;
  products: ProductForIssuance | null;
  orders: { order_number: string } | null;
}

/**
 * Issues a fresh QR code for a card that was lost, and retires the old one.
 *
 * The replacement inherits the running number - to the member and to the office
 * it is still "übertragbar-2" - and comes back as still to send, because the
 * member is holding a card whose code no longer works.
 */
export async function regenerateTicket(ticketId: string): Promise<{ newTicketId: string }> {
  const supabase = await getSupabaseServerClient();

  const { data: old, error: loadError } = await supabase
    .from("tickets")
    .select("id, product_id, holder_name, transferable, transferable_index, season, status, products(name, type, tier_level, benefits), orders(order_number)")
    .eq("id", ticketId)
    .single<TicketForRegeneration>();
  if (loadError || !old) {
    throw new Error(loadError?.message ?? `Ticket ${ticketId} not found`);
  }
  if (!old.products) {
    throw new Error(`Ticket ${ticketId} has no product to render a card from.`);
  }
  if (old.status === "ersetzt") {
    throw new Error("Diese Karte wurde bereits ersetzt.");
  }

  const built = await buildTicket({
    orderItemId: null,
    productId: old.product_id,
    product: old.products,
    holderName: old.holder_name,
    transferable: old.transferable,
    transferableIndex: old.transferable_index,
    season: old.season,
    orderNumber: old.orders?.order_number ?? "-",
  });

  await uploadAll(supabase, [built]);

  const { error: regenerateError } = await supabase.rpc("regenerate_ticket", {
    p_old_ticket_id: ticketId,
    p_new_ticket_id: built.id,
    p_new_token: built.token,
    p_pdf_path: built.pdfPath,
  });
  if (regenerateError) {
    throw new Error(regenerateError.message);
  }

  return { newTicketId: built.id };
}
