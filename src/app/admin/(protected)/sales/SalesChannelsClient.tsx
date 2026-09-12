"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/Input/Input";
import { Button } from "@/components/ui/Button/Button";
import { setSalesChannelAction } from "./actions";
import type { SalesChannel, SalesChannelType, SalesMode } from "@/lib/shop/sales-channels";
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

const MODES: Array<{ value: SalesMode; label: string; explains: string }> = [
  {
    value: "shop",
    label: "Im Shop kaufen",
    explains:
      "Der Knopf legt die Karte in den Warenkorb, der Kauf läuft über die Kasse dieses Shops - und jede Bestellung muss von Hand verbucht werden.",
  },
  {
    value: "website",
    label: "Auf der Website kaufen",
    explains:
      "Die Karten werden weiterhin angezeigt, der Knopf führt aber in einem neuen Tab auf die eingetragene Adresse. Es entsteht keine Bestellung in diesem Shop.",
  },
  {
    value: "disabled",
    label: "Kauf deaktiviert",
    explains:
      "Die Karten bleiben mit Preis und Vorteilen stehen, der Knopf ist ausgegraut und lässt sich nicht anklicken. Gekauft wird nirgends über diese Seite.",
  },
];

interface Row extends SalesChannel {
  /** What is on screen, which may differ from what is saved until Speichern. */
  draftMode: SalesMode;
  draftUrl: string;
  message: string | null;
  error: string | null;
}

export function SalesChannelsClient({ channels }: { channels: SalesChannel[] }) {
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<Row[]>(() =>
    channels.map((channel) => ({
      ...channel,
      draftMode: channel.mode,
      draftUrl: channel.websiteUrl ?? "",
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
        await setSalesChannelAction(row.productType, row.draftMode, row.draftUrl);
        update(row.productType, {
          mode: row.draftMode,
          websiteUrl: row.draftUrl.trim() || null,
          message: `Gespeichert - ${MODES.find((mode) => mode.value === row.draftMode)?.label.toLowerCase()}.`,
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
        const dirty = row.draftMode !== row.mode || row.draftUrl.trim() !== (row.websiteUrl ?? "");
        const explains = MODES.find((mode) => mode.value === row.draftMode)?.explains;

        return (
          <section key={row.productType} className={styles.row}>
            <div className={styles.rowHead}>
              <h2 className={styles.rowTitle}>{group.title}</h2>
              <p className={styles.rowMeta}>
                {group.products} · auf der {group.where}
              </p>
            </div>

            {/* Radios rather than buttons: this is one choice out of three, and a
                radio group gives keyboard arrow navigation and the right
                announcement for free. */}
            <fieldset className={styles.segmented} disabled={isPending}>
              <legend className={styles.visuallyHidden}>{group.title}: wo gekauft wird</legend>
              {MODES.map((mode) => (
                <label key={mode.value} className={styles.segment} data-active={row.draftMode === mode.value ? "true" : undefined}>
                  <input
                    type="radio"
                    name={`mode-${row.productType}`}
                    value={mode.value}
                    checked={row.draftMode === mode.value}
                    onChange={() => update(row.productType, { draftMode: mode.value, message: null, error: null })}
                    className={styles.visuallyHidden}
                  />
                  {mode.label}
                </label>
              ))}
            </fieldset>

            <p className={styles.rowExplain}>{explains}</p>

            <div className={styles.rowForm}>
              <Input
                label="Adresse auf uhcuster.ch"
                value={row.draftUrl}
                onChange={(event) => update(row.productType, { draftUrl: event.target.value, message: null, error: null })}
                placeholder="https://uhcuster.ch/de/fanzone/..."
                hint={row.draftMode === "website" ? undefined : "Wird gemerkt, auch wenn sie gerade nicht gebraucht wird."}
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
        Das Testprodukt &quot;TEST - Bitte nicht kaufen&quot; bleibt immer im Shop kaufbar, damit die Kasse auch dann
        durchgespielt werden kann, wenn alles andere umgestellt ist.
      </p>
    </div>
  );
}
