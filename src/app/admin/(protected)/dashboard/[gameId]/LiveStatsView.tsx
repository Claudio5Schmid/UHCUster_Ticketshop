"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { refreshLiveGameStats } from "./actions";
import type { LiveGameStats } from "@/lib/admin/live";
import styles from "../../admin.module.css";

const POLL_INTERVAL_MS = 20000;

export function LiveStatsView({ gameId, initialStats }: { gameId: string; initialStats: LiveGameStats }) {
  const [stats, setStats] = useState(initialStats);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`scan-game-${gameId}`)
      .on("broadcast", { event: "redeemed" }, () => {
        setStats((current) => ({
          ...current,
          redeemed: current.redeemed + 1,
          outstanding: Math.max(0, current.outstanding - 1),
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const fresh = await refreshLiveGameStats(gameId);
      setStats(fresh);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [gameId]);

  return (
    <div className={styles.detailGrid}>
      <dl className={styles.detailBlock}>
        <dt>Gescannt</dt>
        <dd>{stats.redeemed}</dd>
      </dl>
      <dl className={styles.detailBlock}>
        <dt>Ausstehend</dt>
        <dd>{stats.outstanding}</dd>
      </dl>
      <dl className={styles.detailBlock}>
        <dt>Ablehnungen</dt>
        <dd>{stats.rejections}</dd>
      </dl>
    </div>
  );
}
