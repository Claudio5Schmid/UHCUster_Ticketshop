"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Select/Select";
import { Input } from "@/components/ui/Input/Input";
import { PRODUCT_CATEGORY_LABELS, type ProductCategory } from "@/lib/products";
import styles from "./admin.module.css";

const SEARCH_DEBOUNCE_MS = 300;

export interface OrderFilterValues {
  status: string;
  search: string;
  source: string;
  category: string;
  variant: string;
  notified: string;
}

interface OrderFiltersProps extends OrderFilterValues {
  variants: Array<{ category: ProductCategory; variant: string; label: string }>;
}

/**
 * Filters apply as soon as you change them - no "Filtern" button to click. The
 * selects navigate immediately; the search box debounces so it doesn't fire a
 * request per keystroke. The state lives in the URL, so a filtered list can be
 * reloaded, shared, or handed to the invoice export as it stands.
 */
export function OrderFilters({ status, search, source, category, variant, notified, variants }: OrderFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search);

  const lastPushedSearch = useRef(search);
  useEffect(() => {
    if (search !== lastPushedSearch.current) {
      lastPushedSearch.current = search;
      setSearchValue(search);
    }
  }, [search]);

  function pushParams(next: Partial<OrderFilterValues>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => {
      router.replace(`/admin?${params.toString()}`, { scroll: false });
    });
  }

  useEffect(() => {
    if (searchValue === search) return;
    const timer = setTimeout(() => {
      lastPushedSearch.current = searchValue;
      pushParams({ search: searchValue });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  // A variant belongs to a category; picking one narrows the other.
  const visibleVariants = category && category !== "alle" ? variants.filter((entry) => entry.category === category) : variants;

  return (
    <div className={styles.filters} data-pending={isPending ? "true" : undefined}>
      <Select name="status" label="Status" value={status} onChange={(event) => pushParams({ status: event.target.value })}>
        <option value="neu">Neu</option>
        <option value="rechnung_versendet">Rechnung versendet</option>
        <option value="bezahlt">Bezahlt</option>
        <option value="storniert">Storniert</option>
        <option value="alle">Alle</option>
      </Select>
      <Select name="source" label="Quelle" value={source} onChange={(event) => pushParams({ source: event.target.value })}>
        <option value="">Alle</option>
        <option value="shop">Shop</option>
        <option value="csv_import">Import</option>
      </Select>
      <Select
        name="category"
        label="Produkt"
        value={category}
        onChange={(event) => pushParams({ category: event.target.value, variant: "" })}
      >
        <option value="">Alle</option>
        {(Object.keys(PRODUCT_CATEGORY_LABELS) as ProductCategory[]).map((key) => (
          <option key={key} value={key}>
            {PRODUCT_CATEGORY_LABELS[key]}
          </option>
        ))}
      </Select>
      <Select name="variant" label="Variante" value={variant} onChange={(event) => pushParams({ variant: event.target.value })}>
        <option value="">Alle</option>
        {visibleVariants.map((entry) => (
          <option key={`${entry.category}/${entry.variant}`} value={entry.variant}>
            {category && category !== "alle" ? entry.label : `${PRODUCT_CATEGORY_LABELS[entry.category]}: ${entry.label}`}
          </option>
        ))}
      </Select>
      <Select name="notified" label="Informiert" value={notified} onChange={(event) => pushParams({ notified: event.target.value })}>
        <option value="">Alle</option>
        <option value="offen">Noch nicht informiert</option>
      </Select>
      <div className={styles.searchField}>
        <Input
          name="search"
          label="Suche"
          placeholder="Name, Firma, E-Mail, Bestell- oder Rechnungsnummer"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
        />
      </div>
    </div>
  );
}
