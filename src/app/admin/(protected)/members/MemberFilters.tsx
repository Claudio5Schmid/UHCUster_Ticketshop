"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Select/Select";
import { Input } from "@/components/ui/Input/Input";
import styles from "../admin.module.css";

const SEARCH_DEBOUNCE_MS = 300;

interface MemberFiltersProps {
  search: string;
  kategorie: string;
  versand: string;
  /** Only the categories actually in use, so the list can never offer a dead end. */
  kategorien: string[];
}

/**
 * Same behaviour as the order list's filters: they apply the moment you change
 * them, the search box debounces so it doesn't fire per keystroke, and the state
 * lives in the URL so a filtered list can be reloaded or shared as it stands.
 */
export function MemberFilters({ search, kategorie, versand, kategorien }: MemberFiltersProps) {
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

  function pushParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => {
      router.replace(`/admin/members?${params.toString()}`, { scroll: false });
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
      <Select name="versand" label="Versand" value={versand} onChange={(event) => pushParams({ versand: event.target.value })}>
        <option value="">Alle</option>
        <option value="offen">Nichts versendet</option>
        <option value="teilweise">Teilweise versendet</option>
        <option value="vollstaendig">Vollständig versendet</option>
        <option value="ohne">Ohne Karte</option>
      </Select>
      <Select
        name="kategorie"
        label="Kategorie"
        value={kategorie}
        onChange={(event) => pushParams({ kategorie: event.target.value })}
      >
        <option value="">Alle</option>
        {kategorien.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </Select>
      <div className={styles.searchField}>
        <Input
          name="search"
          label="Suche"
          placeholder="Name, E-Mail oder Kategorie"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
        />
      </div>
    </div>
  );
}
