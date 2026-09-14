import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { syncGamesFromSwissUnihockey } from "@/lib/sync-games";

/**
 * Scheduled sync: pulls UHC Uster's L-UPL home games (date, time, venue, opponent)
 * from the public Swiss Unihockey API and upserts them into `games`, matched by
 * `external_id` so re-running it updates an existing game (e.g. postponed) rather
 * than duplicating it. Never touches `eventfrog_url` - that stays whatever an admin
 * set, or null until one is configured.
 *
 * Triggered by Vercel Cron (see vercel.json); Vercel sends
 * `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET is set.
 *
 * A missing secret refuses the request rather than waving it through. The check used
 * to read "if a secret is configured, it must match", which meant an unset variable
 * removed the guard instead of closing it - verified on 2026-09-14 by calling the
 * production URL with no credentials at all and watching it write to the database.
 * Nothing worse than federation fixtures could be written that way, but an
 * unauthenticated write is an unauthenticated write, and the failure mode was
 * silent: the endpoint would have gone public again the moment the variable was
 * dropped. Now the sync stops instead, which is noticed.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured; refusing to run." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncGamesFromSwissUnihockey(getSupabaseAdminClient());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sync failed" }, { status: 500 });
  }
}
