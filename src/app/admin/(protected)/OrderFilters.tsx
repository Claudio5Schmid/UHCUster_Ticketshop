"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Select/Select";
import { Input } from "@/components/ui/Input/Input";
import styles from "./admin.module.css";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Filters apply as soon as you change them - no "Filtern" button to click. The status
 * select navigates immediately; the search box debounces so it doesn't fire a request
 * per keystroke.
 */
export function OrderFilters({ status, search }: { status: string; search: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search);

  // Keeps the input in sync when the URL changes from outside this component
  // (back/forward navigation), without clobbering what's being typed.
  const lastPushedSearch = useRef(search);
  useEffect(() => {
    if (search !== lastPushedSearch.current) {
      lastPushedSearch.current = search;
      setSearchValue(search);
    }
  }, [search]);

  function pushParams(next: { status?: string; search?: string }) {
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

  return (
    <div className={styles.filters} data-pending={isPending ? "true" : undefined}>
      <Select
        name="status"
        label="Status"
        value={status}
        onChange={(event) => pushParams({ status: event.target.value })}
      >
        <option value="neu">Neu</option>
        <option value="rechnung_versendet">Rechnung versendet</option>
        <option value="bezahlt">Bezahlt</option>
        <option value="storniert">Storniert</option>
        <option value="alle">Alle</option>
      </Select>
      <div className={styles.searchField}>
        <Input
          name="search"
          label="Suche"
          placeholder="Name oder Bestellnummer"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
        />
      </div>
    </div>
  );
}
