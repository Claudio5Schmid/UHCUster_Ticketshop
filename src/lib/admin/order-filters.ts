import type { OrderFilters, OrderStatus } from "@/lib/admin/orders";
import type { ProductCategory } from "@/lib/products";

export interface OrderSearchParams {
  status?: string;
  search?: string;
  source?: string;
  category?: string;
  variant?: string;
  notified?: string;
}

/** The URL's filter state as the list function understands it - shared by the
 * orders page and the invoice export, so both read the same query string. */
export function parseOrderFilters(params: OrderSearchParams): OrderFilters {
  return {
    status: (params.status as OrderStatus | "alle" | undefined) ?? "neu",
    search: params.search ?? "",
    source: (params.source as OrderFilters["source"]) || "alle",
    category: (params.category as ProductCategory | undefined) || "alle",
    variant: params.variant || "alle",
    notified: params.notified === "offen" ? "offen" : "alle",
  };
}
