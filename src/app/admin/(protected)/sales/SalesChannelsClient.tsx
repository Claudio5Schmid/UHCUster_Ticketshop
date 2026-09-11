"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/Input/Input";
import { Button } from "@/components/ui/Button/Button";
import { Switch } from "@/components/ui/Switch/Switch";
import { setSalesChannelAction } from "./actions";
import type { SalesChannel, SalesChannelType } from "@/lib/shop/sales-channels";
import styles from "./sales.module.css";
import adminStyles from "../admin.module.css";

const GROUPS: Record<SalesChannelType, { title: string; products: string; where: string }> = {
  season_pass: {
    title: "Saisonkarten",
    products: "Saisonkarte Erwachsene, Saisonkarte Reduziert, UHC Sponsoren Legi",
    where: "Startseite",
  },
  membership: {
    title: "Red Castle Club",
    products: "Normal, Bronze, Silber, Gold",
    where: "Red-Castle-Club-Seite",
  },
};

interface Row extends SalesChannel {
  /** What is on screen, which may differ from what is saved until Speichern. */
  draftUrl: string;
  draftRedirect: boolean;
  message: string | null;
  error: string | null;
}

export function SalesChannelsClient({ channels }: { channels: SalesChannel[] }) {
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<Row[]>(() =>
    channels.map((channel) => ({
      ...channel,
      draftUrl: channel.websiteUrl ?? "",
      draftRedirect: channel.redirectToWebsite,
      message: null,
      error: null,
    }))
  );

  function update(productType: SalesChannelType, patch: Partial<Row>) {
    setRows((prev) => prev.map((row) => (row.productType === productType ? { ...row, ...patch } : row)));
  }

  function save(row: Row) {
    update(row.productType, { message: null, error: null });
    startTransition(async () => {
      try {
        await setSalesChannelAction(row.productType, row.draftRedirect, row.draftUrl);
        update(row.productType, {
          redirectToWebsite: row.draftRedirect,
          websiteUrl: row.draftUrl.trim() || null,
          message: row.draftRedirect ? "Gespeichert - der Kauf läuft über die Website." : "Gespeichert - der Kauf läuft im Shop.",
        });
      } catch (saveError) {
        update(row.productType, {
          error: saveError instanceof Error ? saveError.message : "Fehler beim Speichern.",
        });
      }
    });
  }

  return (
    <div className={styles.rows}>
      {rows.map((row) => {
        const group = GROUPS[row.productType];
        const dirty = row.draftRedirect !== row.redirectToWebsite || row.draftUrl.trim() !== (row.websiteUrl ?? "");

        return (
          <section key={row.productType} className={styles.row}>
            <div className={styles.rowHead}>
              <div>
                <h2 className={styles.rowTitle}>{group.title}</h2>
                <p className={styles.rowMeta}>
                  {group.products} · auf der {group.where}
                </p>
              </div>
              <Switch
                label={`${group.title}: wo gekauft wird`}
                checked={row.draftRedirect}
                offLabel="Im Shop kaufen"
                onLabel="Auf der Website kaufen"
                disabled={isPending}
                onChange={(next) => update(row.productType, { draftRedirect: next, message: null, error: null })}
              />
            </div>

            <p className={styles.rowExplain}>
              {row.draftRedirect
                ? "Die Karten werden weiterhin angezeigt, der Knopf führt aber in einem neuen Tab auf die Website. Es entsteht keine Bestellung in diesem Shop."
                : "Der Knopf legt die Karte in den Warenkorb, der Kauf läuft über die Kasse dieses Shops."}
            </p>

            <div className={styles.rowForm}>
              <Input
                label="Adresse auf uhcuster.ch"
                value={row.draftUrl}
                onChange={(event) => update(row.productType, { draftUrl: event.target.value, message: null, error: null })}
                placeholder="https://uhcuster.ch/de/fanzone/fanzonen.htm"
                hint={row.draftRedirect ? undefined : "Wird gemerkt, auch solange im Shop verkauft wird."}
                error={row.error ?? undefined}
              />
              <Button type="button" size="sm" disabled={isPending || !dirty} onClick={() => save(row)}>
                Speichern
              </Button>
            </div>

            {row.message && <p className={adminStyles.successMessage}>{row.message}</p>}
          </section>
        );
      })}

      <p className={styles.footnote}>
        Das Testprodukt &quot;TEST - Bitte nicht kaufen&quot; bleibt immer im Shop, damit die Kasse auch dann
        durchgespielt werden kann, wenn alles andere auf die Website zeigt.
      </p>
    </div>
  );
}
