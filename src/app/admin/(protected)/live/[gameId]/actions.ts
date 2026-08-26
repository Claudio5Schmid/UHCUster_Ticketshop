"use server";

import { getLiveGameStats, type LiveGameStats } from "@/lib/admin/live";

export async function refreshLiveGameStats(gameId: string): Promise<LiveGameStats> {
  return getLiveGameStats(gameId);
}
