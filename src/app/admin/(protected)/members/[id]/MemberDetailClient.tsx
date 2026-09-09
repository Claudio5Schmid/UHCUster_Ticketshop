"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input/Input";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { Modal } from "@/components/ui/Modal/Modal";
import { TicketTable } from "@/components/admin/TicketTable/TicketTable";
import { addCardsToMemberAction } from "../actions";
import { memberSendState, type Member } from "@/lib/admin/member-state";
import type { OrderTicket } from "@/lib/admin/tickets";
import styles from "../../admin.module.css";

const SEND_STATE_LABEL = {
  ohne: "Keine Karte",
  offen: "Nichts versendet",
  teilweise: "Teilweise versendet",
  vollstaendig: "Vollständig versendet",
} as const;

const SEND_STATE_VARIANT = {
  ohne: "neutral",
  offen: "warning",
  teilweise: "info",
  vollstaendig: "success",
} as const;

interface MemberDetailClientProps {
  member: Member;
  tickets: OrderTicket[];
}

export function MemberDetailClient({ member, tickets }: MemberDetailClientProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAddCards, setShowAddCards] = useState(false);
  const [personal, setPersonal] = useState(0);
  const [transferable, setTransferable] = useState(1);

  const state = memberSendState(member);

  function handleAddCards(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await addCardsToMemberAction(member.id, { personal, transferable });
        setPersonal(0);
        setTransferable(1);
        setShowAddCards(false);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Erstellen der Karten.");
      }
    });
  }

  return (
    <div>
      <div className={styles.header}>
        <h1>
          {member.vorname} {member.nachname}
        </h1>
        <Badge variant={SEND_STATE_VARIANT[state]}>{SEND_STATE_LABEL[state]}</Badge>
      </div>

      {error && <p style={{ color: "var(--color-error-text)", marginBottom: "var(--space-4)" }}>{error}</p>}

      <div className={styles.detailGrid}>
        <dl className={styles.detailBlock}>
          <dt>E-Mail</dt>
          <dd>{member.email}</dd>
          <dt>Kategorie</dt>
          <dd>{member.kategorie ?? "–"}</dd>
          <dt>Bestellung</dt>
          <dd>
            {member.order_number ? (
              <Link href={`/admin/orders/${member.order_number}`} className={styles.orderLink}>
                {member.order_number}
              </Link>
            ) : (
              "Noch keine"
            )}
          </dd>
        </dl>

        <dl className={styles.detailBlock}>
          <dt>Aktive Karten</dt>
          <dd>
            {member.cards.active}
            {member.cards.active > 0 && (
              <span style={{ color: "var(--color-text-secondary)" }}>
                {" "}
                ({member.cards.personal} persönlich, {member.cards.transferable} übertragbar)
              </span>
            )}
          </dd>
          <dt>Versendet</dt>
          <dd>
            {member.cards.active === 0 ? "–" : `${member.cards.sent} von ${member.cards.active}`}
          </dd>
          <dt>Deaktiviert</dt>
          <dd>{member.cards.inactive}</dd>
        </dl>
      </div>

      <div className={styles.section}>
        <div className={styles.header}>
          <h2>Karten</h2>
          <Button type="button" size="sm" variant="secondary" onClick={() => setShowAddCards(true)}>
            Karten erstellen
          </Button>
        </div>

        {tickets.length === 0 ? (
          <p className={styles.emptyState}>
            Dieses Mitglied hat noch keine Karten. Über „Karten erstellen“ werden sie mit PDF und QR-Code erzeugt.
          </p>
        ) : (
          <TicketTable
            tickets={tickets}
            orderNumber={member.order_number ?? ""}
            target={{ memberId: member.id, orderNumber: member.order_number ?? undefined }}
          />
        )}
      </div>

      <Modal open={showAddCards} onClose={() => setShowAddCards(false)} title="Karten erstellen">
        <form onSubmit={handleAddCards} className={styles.form}>
          <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
            Neue Karten werden sofort mit PDF und QR-Code erzeugt. Übertragbare Karten zählen ab der höchsten bisher
            vergebenen Nummer weiter — auch Nummern deaktivierter Karten bleiben belegt.
          </p>
          <div className={styles.formRow}>
            <Input
              label="Anzahl persönliche Karten"
              type="number"
              min={0}
              value={personal}
              onChange={(e) => setPersonal(parseInt(e.target.value, 10) || 0)}
            />
            <Input
              label="Anzahl übertragbare Karten"
              type="number"
              min={0}
              value={transferable}
              onChange={(e) => setTransferable(parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className={styles.actions}>
            <Button type="submit" disabled={isPending || personal + transferable === 0}>
              {personal + transferable} Karte(n) erstellen
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowAddCards(false)}>
              Abbrechen
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
