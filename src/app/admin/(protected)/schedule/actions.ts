"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { syncGamesFromSwissUnihockey } from "@/lib/sync-games";

export async function setGameEventfrogUrl(gameId: string, eventfrogUrl: string) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("games")
    .update({ eventfrog_url: eventfrogUrl || null })
    .eq("id", gameId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/schedule");
  revalidatePath("/spielplan");
  revalidatePath("/");
}

export async function setGameScannerCode(gameId: string, code: string) {
  const supabase = await getSupabaseServerClient();
  const trimmed = code.trim();

  if (!trimmed) {
    const { error } = await supabase.from("game_scanner_codes").delete().eq("game_id", gameId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("game_scanner_codes").upsert({ game_id: gameId, code: trimmed });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/admin/schedule");
}

/**
 * Hand-corrects a game when Swiss Unihockey has it wrong or hasn't caught up yet
 * (postponed game, changed venue). Setting manual_override marks the row as
 * admin-owned, so the next sync - cron or button - won't revert the correction.
 */
export async function updateGameDetails(
  gameId: string,
  details: { opponent: string; playedAt: string; venue: string }
) {
  const supabase = await getSupabaseServerClient();

  const playedAt = new Date(details.playedAt);
  if (Number.isNaN(playedAt.getTime())) {
    throw new Error("Ungültiges Datum.");
  }
  if (!details.opponent.trim()) {
    throw new Error("Gegner darf nicht leer sein.");
  }

  const { error } = await supabase
    .from("games")
    .update({
      opponent: details.opponent.trim(),
      played_at: playedAt.toISOString(),
      venue: details.venue.trim() || null,
      manual_override: true,
    })
    .eq("id", gameId);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/schedule");
  revalidatePath("/spielplan");
  revalidatePath("/");
}

/** Hands a hand-corrected game back to the automatic sync. */
export async function clearGameManualOverride(gameId: string) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("games").update({ manual_override: false }).eq("id", gameId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/schedule");
}

/**
 * Same sync as /api/sync/swissunihockey, but triggered by an admin from the UI -
 * uses the admin's own session (RLS + is_admin()) instead of the service-role
 * client, since this is exactly the kind of admin-attributed action that pattern
 * is for, and it's already gated by the admin layout's auth check.
 */
export async function syncGamesNow(): Promise<{ synced: number; skipped: number }> {
  const supabase = await getSupabaseServerClient();
  const result = await syncGamesFromSwissUnihockey(supabase);

  revalidatePath("/admin/schedule");
  revalidatePath("/spielplan");
  revalidatePath("/");

  return result;
}
