import { getSupabaseServerClient } from "@/lib/supabase-server";

export interface GameAttendanceRow {
  gameId: string;
  opponent: string;
  playedAt: string;
  totalAccepted: number;
  totalRejected: number;
  byProduct: Record<string, number>;
}

export interface AttendanceReport {
  games: GameAttendanceRow[];
  productNames: string[];
  grandTotalByProduct: Record<string, number>;
  grandTotal: number;
  grandTotalRejected: number;
}

interface ScanEventRow {
  game_id: string;
  result: string;
  tickets: { products: { name: string } | { name: string }[] | null } | { products: { name: string } | { name: string }[] | null }[] | null;
}

function firstOf<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Attendance by product ("Erwachsene", "Mitglieder", "Red Castle Club Gold",
 * ...) for one or more games - counted from actual accepted scans
 * (scan_events), not tickets sold, since a season pass is valid at every
 * home game and "attended this game" only means "scanned in at this game".
 * Categories are derived directly from products.name rather than a fixed
 * list, so the breakdown stays correct as the product catalog changes.
 */
export async function getAttendanceReport(gameIds: string[]): Promise<AttendanceReport> {
  if (gameIds.length === 0) {
    return { games: [], productNames: [], grandTotalByProduct: {}, grandTotal: 0, grandTotalRejected: 0 };
  }

  const supabase = await getSupabaseServerClient();

  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("id, opponent, played_at")
    .in("id", gameIds)
    .order("played_at", { ascending: true });
  if (gamesError) throw new Error(`Failed to load games: ${gamesError.message}`);

  const { data: scans, error: scansError } = await supabase
    .from("scan_events")
    .select("game_id, result, tickets(products(name))")
    .in("game_id", gameIds);
  if (scansError) throw new Error(`Failed to load scan events: ${scansError.message}`);

  const productNamesSet = new Set<string>();
  const byGame = new Map<string, { totalAccepted: number; totalRejected: number; byProduct: Map<string, number> }>();
  for (const id of gameIds) {
    byGame.set(id, { totalAccepted: 0, totalRejected: 0, byProduct: new Map() });
  }

  for (const scan of (scans ?? []) as ScanEventRow[]) {
    const bucket = byGame.get(scan.game_id);
    if (!bucket) continue;

    if (scan.result !== "accepted") {
      bucket.totalRejected++;
      continue;
    }

    bucket.totalAccepted++;
    const ticket = firstOf(scan.tickets);
    const product = ticket ? firstOf(ticket.products) : null;
    const productName = product?.name ?? "Unbekannt";
    productNamesSet.add(productName);
    bucket.byProduct.set(productName, (bucket.byProduct.get(productName) ?? 0) + 1);
  }

  const productNames = [...productNamesSet].sort();

  const gameRows: GameAttendanceRow[] = (games ?? []).map((game) => {
    const bucket = byGame.get(game.id) ?? { totalAccepted: 0, totalRejected: 0, byProduct: new Map<string, number>() };
    const byProduct: Record<string, number> = {};
    for (const name of productNames) byProduct[name] = bucket.byProduct.get(name) ?? 0;
    return {
      gameId: game.id,
      opponent: game.opponent,
      playedAt: game.played_at,
      totalAccepted: bucket.totalAccepted,
      totalRejected: bucket.totalRejected,
      byProduct,
    };
  });

  const grandTotalByProduct: Record<string, number> = {};
  for (const name of productNames) {
    grandTotalByProduct[name] = gameRows.reduce((sum, g) => sum + (g.byProduct[name] ?? 0), 0);
  }

  return {
    games: gameRows,
    productNames,
    grandTotalByProduct,
    grandTotal: gameRows.reduce((sum, g) => sum + g.totalAccepted, 0),
    grandTotalRejected: gameRows.reduce((sum, g) => sum + g.totalRejected, 0),
  };
}
