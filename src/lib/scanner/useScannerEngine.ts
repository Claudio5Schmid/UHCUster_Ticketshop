"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { hasPlausibleTokenShape } from "./format";
import type { ScannerTicket } from "@/app/api/scanner/tickets/route";
import type { StoredScannerSession } from "./session-storage";

export type ScanResultKind = "accepted" | "already_redeemed" | "invalid_signature" | "not_found" | "voided" | "checking";

export interface ScanFeedback {
  kind: ScanResultKind;
  token: string;
  productName?: string;
  holderName?: string | null;
  redeemedAt?: string | null;
  /** Which device took the earlier accepted scan, when that is known. Null while it
   *  isn't - a device that decided offline from a download predating the redemption
   *  has no way to know until the server answers. */
  redeemedBy?: string | null;
}

interface LocalTicket {
  status: ScannerTicket["status"];
  holderName: string | null;
  transferable: boolean;
  productName: string;
  redeemedAt: string | null;
  redeemedBy: string | null;
}

interface BroadcastPayload {
  scannedToken: string;
  redeemedAt: string;
  /** Added so the door that hears this knows whose scan it was. Without it a second
   *  device could tell that a code was already in, but not that it went in somewhere
   *  else - which is the whole signal. Older senders omit it; treated as unknown. */
  deviceLabel?: string;
}

const REALTIME_EVENT = "redeemed";

async function postScan(session: StoredScannerSession, scannedToken: string) {
  const response = await fetch("/api/scanner/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ scannedToken }),
  });
  if (!response.ok) {
    throw new Error(`scan submit failed: ${response.status}`);
  }
  return (await response.json()) as {
    result: ScanResultKind;
    productName?: string;
    holderName?: string | null;
    redeemedAt?: string;
    redeemedBy?: string;
  };
}

/**
 * Offline-first scan engine (docs/ARCHITECTURE.md Phase 7 section). The full
 * ticket set for the season is downloaded once, before doors open, into an
 * in-memory map; every scan after that is decided locally and instantly, with
 * the server call happening in the background purely to log the attempt and
 * settle races between devices (the unique index on scan_events is the real
 * tie-breaker, not this client). A token this device has never seen (e.g. a
 * pass issued minutes ago, after this device's download) is the one case worth
 * waiting on the network for, rather than wrongly turning someone away - but
 * only if the network actually answers; with no connectivity it still falls
 * back to a local "not_found" rather than hanging.
 */
export function useScannerEngine(session: StoredScannerSession) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [ticketCount, setTicketCount] = useState(0);
  const [lastResult, setLastResult] = useState<ScanFeedback | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const ticketsRef = useRef<Map<string, LocalTicket>>(new Map());
  const pendingRef = useRef<Array<{ scannedToken: string; attempts: number }>>([]);
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseClient>["channel"]> | null>(null);

  const flushPending = useCallback(async () => {
    if (pendingRef.current.length === 0) return;
    const next = [...pendingRef.current];
    pendingRef.current = [];
    for (const item of next) {
      try {
        await postScan(session, item.scannedToken);
      } catch {
        if (item.attempts < 20) {
          pendingRef.current.push({ scannedToken: item.scannedToken, attempts: item.attempts + 1 });
        }
      }
    }
    setPendingSyncCount(pendingRef.current.length);
  }, [session]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/scanner/tickets", {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (!response.ok) throw new Error(`tickets download failed: ${response.status}`);
        const data = (await response.json()) as { tickets: ScannerTicket[] };
        if (cancelled) return;

        const map = new Map<string, LocalTicket>();
        for (const ticket of data.tickets) {
          map.set(ticket.token, {
            status: ticket.status,
            holderName: ticket.holderName,
            transferable: ticket.transferable,
            productName: ticket.productName,
            redeemedAt: ticket.redeemedAt,
            redeemedBy: ticket.redeemedBy,
          });
        }
        ticketsRef.current = map;
        setTicketCount(map.size);
        setStatus("ready");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Ticketliste konnte nicht geladen werden.");
          setStatus("error");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const channel = supabase.channel(`scan-game-${session.gameId}`);
    channel
      .on("broadcast", { event: REALTIME_EVENT }, (message) => {
        const payload = message.payload as BroadcastPayload;
        const ticket = ticketsRef.current.get(payload.scannedToken);
        if (ticket && !ticket.redeemedAt) {
          ticket.redeemedAt = payload.redeemedAt;
          ticket.redeemedBy = payload.deviceLabel ?? null;
        }
      })
      .subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.gameId]);

  useEffect(() => {
    const interval = setInterval(flushPending, 5000);
    window.addEventListener("online", flushPending);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", flushPending);
    };
  }, [flushPending]);

  /**
   * The response used to be thrown away - the local decision had already been shown
   * and the call was only there to log. It still is, with one exception: when this
   * device decided "already scanned" from a download that predates the redemption,
   * the server's answer is the only place the redeeming device's name exists. That
   * turns a plain "already in" into "already in at another door", so it is worth
   * upgrading the result that is still on screen.
   *
   * Guarded on the token: by the time this lands, the person at the door may have
   * tapped on and scanned someone else, and their result must not be overwritten.
   */
  const submitInBackground = useCallback(
    (scannedToken: string) => {
      postScan(session, scannedToken)
        .then((response) => {
          if (response.result !== "already_redeemed" || !response.redeemedBy) return;

          const ticket = ticketsRef.current.get(scannedToken);
          if (ticket) ticket.redeemedBy = response.redeemedBy;

          setLastResult((current) =>
            current && current.token === scannedToken && current.kind === "already_redeemed" && !current.redeemedBy
              ? { ...current, redeemedBy: response.redeemedBy, redeemedAt: current.redeemedAt ?? response.redeemedAt }
              : current
          );
        })
        .catch(() => {
          pendingRef.current.push({ scannedToken, attempts: 1 });
          setPendingSyncCount(pendingRef.current.length);
        });
    },
    [session]
  );

  const broadcastRedemption = useCallback(
    (scannedToken: string, redeemedAt: string) => {
      channelRef.current?.send({
        type: "broadcast",
        event: REALTIME_EVENT,
        payload: { scannedToken, redeemedAt, deviceLabel: session.deviceLabel },
      });
    },
    [session.deviceLabel]
  );

  const processScan = useCallback(
    (rawToken: string) => {
      const scannedToken = rawToken.trim().toUpperCase();

      if (!hasPlausibleTokenShape(scannedToken)) {
        setLastResult({ kind: "invalid_signature", token: scannedToken });
        return;
      }

      const ticket = ticketsRef.current.get(scannedToken);

      if (!ticket) {
        setLastResult({ kind: "checking", token: scannedToken });
        postScan(session, scannedToken)
          .then((response) => {
            if (response.result === "accepted") {
              ticketsRef.current.set(scannedToken, {
                status: "gueltig",
                holderName: response.holderName ?? null,
                transferable: Boolean(response.holderName),
                productName: response.productName ?? "-",
                redeemedAt: new Date().toISOString(),
                redeemedBy: session.deviceLabel,
              });
              setTicketCount(ticketsRef.current.size);
            }
            setLastResult({
              kind: response.result,
              token: scannedToken,
              productName: response.productName,
              holderName: response.holderName,
              redeemedAt: response.redeemedAt,
              redeemedBy: response.redeemedBy,
            });
          })
          .catch(() => {
            setLastResult({ kind: "not_found", token: scannedToken });
          });
        return;
      }

      if (ticket.status !== "gueltig") {
        setLastResult({ kind: "voided", token: scannedToken, productName: ticket.productName, holderName: ticket.holderName });
        submitInBackground(scannedToken);
        return;
      }

      if (ticket.redeemedAt) {
        setLastResult({
          kind: "already_redeemed",
          token: scannedToken,
          productName: ticket.productName,
          holderName: ticket.holderName,
          redeemedAt: ticket.redeemedAt,
          redeemedBy: ticket.redeemedBy,
        });
        submitInBackground(scannedToken);
        return;
      }

      const now = new Date().toISOString();
      ticket.redeemedAt = now;
      ticket.redeemedBy = session.deviceLabel;
      setLastResult({ kind: "accepted", token: scannedToken, productName: ticket.productName, holderName: ticket.holderName });
      submitInBackground(scannedToken);
      broadcastRedemption(scannedToken, now);
    },
    [session, submitInBackground, broadcastRedemption]
  );

  return { status, error, ticketCount, lastResult, pendingSyncCount, processScan };
}
