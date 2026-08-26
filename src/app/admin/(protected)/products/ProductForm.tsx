"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/Input/Input";
import { Select } from "@/components/ui/Select/Select";
import { Button } from "@/components/ui/Button/Button";
import type { AdminProduct } from "@/lib/admin/products";
import { createProduct, updateProduct } from "./actions";
import styles from "../admin.module.css";

interface ProductFormProps {
  product?: AdminProduct;
}

export function ProductForm({ product }: ProductFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    const input = {
      slug: String(formData.get("slug")),
      name: String(formData.get("name")),
      description: String(formData.get("description") ?? ""),
      type: formData.get("type") as "season_pass" | "membership",
      priceRappen: Math.round(Number(formData.get("priceChf")) * 100),
      tierLevel: Number(formData.get("tierLevel")),
      sortOrder: Number(formData.get("sortOrder")),
      active: formData.get("active") === "on",
      highlights: String(formData.get("highlights") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      singleTicketPriceRappen: formData.get("singleTicketPriceChf")
        ? Math.round(Number(formData.get("singleTicketPriceChf")) * 100)
        : null,
      includedPasses: formData.get("includedPasses") ? Number(formData.get("includedPasses")) : null,
      transferable: formData.get("transferable") === "on",
    };

    startTransition(async () => {
      try {
        if (product) {
          await updateProduct(product.id, product.price_rappen, input);
        } else {
          await createProduct(input);
        }
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Speichern.");
      }
    });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Input name="slug" label="Slug" defaultValue={product?.slug} placeholder="saisonkarte-erwachsener" required />
      <Input name="name" label="Name" defaultValue={product?.name} required />
      <Input name="description" label="Beschreibung" defaultValue={product?.description ?? ""} />
      <Select name="type" label="Typ" defaultValue={product?.type ?? "season_pass"}>
        <option value="season_pass">Saisonkarte</option>
        <option value="membership">Red Castle Club</option>
      </Select>
      <Input
        name="priceChf"
        label="Preis (CHF)"
        type="number"
        step="0.05"
        min="0"
        defaultValue={product ? product.price_rappen / 100 : 0}
        required
      />
      <Input name="tierLevel" label="Tier-Stufe (0-4)" type="number" min="0" max="4" defaultValue={product?.tier_level ?? 0} required />
      <Input name="sortOrder" label="Sortierung" type="number" defaultValue={product?.sort_order ?? 0} required />
      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <input type="checkbox" name="active" defaultChecked={product?.active ?? true} />
        Aktiv (im Shop sichtbar)
      </label>

      <Input
        name="highlights"
        label="Vorteile (eine Zeile pro Punkt)"
        defaultValue={product?.benefits?.highlights?.join("\n")}
      />
      <Input
        name="singleTicketPriceChf"
        label="Einzeleintritt-Referenzpreis (CHF, optional - für Ersparnis-Anzeige)"
        type="number"
        step="0.05"
        min="0"
        defaultValue={product?.benefits?.single_ticket_price_rappen ? product.benefits.single_ticket_price_rappen / 100 : ""}
      />
      <Input
        name="includedPasses"
        label="Enthaltene Karten (optional, für Red Castle Club Bundles)"
        type="number"
        min="1"
        defaultValue={product?.benefits?.included_passes ?? ""}
      />
      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <input type="checkbox" name="transferable" defaultChecked={product?.benefits?.transferable ?? false} />
        Übertragbar (gemeinsamer Name für alle Karten dieser Bestellung)
      </label>

      {error && <p style={{ color: "var(--color-error-text)" }}>{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Wird gespeichert …" : "Speichern"}
      </Button>
    </form>
  );
}
