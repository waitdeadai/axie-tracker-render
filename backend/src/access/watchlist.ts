import { getDb, normalizeWallet } from './db';

// Rival watchlist — the paid "Live Rival Radar" feature. A wallet (SIWE identity)
// pins specific ladder players (Sky Mavis userIds) to track. Lives in the access DB.
export interface WatchEntry {
  wallet: string;
  player_user_id: string;
  player_name: string;
  created_at: number;
}

export function addWatch(
  wallet: string,
  playerUserId: string,
  playerName: string,
  now: number = Date.now()
): WatchEntry {
  const w = normalizeWallet(wallet);
  getDb()
    .prepare(
      `INSERT INTO watchlist (wallet, player_user_id, player_name, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(wallet, player_user_id) DO UPDATE SET player_name = excluded.player_name`
    )
    .run(w, playerUserId, playerName, now);
  return { wallet: w, player_user_id: playerUserId, player_name: playerName, created_at: now };
}

export function removeWatch(wallet: string, playerUserId: string): void {
  getDb()
    .prepare('DELETE FROM watchlist WHERE wallet = ? AND player_user_id = ?')
    .run(normalizeWallet(wallet), playerUserId);
}

export function getWatchlist(wallet: string): WatchEntry[] {
  return getDb()
    .prepare('SELECT * FROM watchlist WHERE wallet = ? ORDER BY created_at DESC')
    .all(normalizeWallet(wallet)) as WatchEntry[];
}

export function isWatching(wallet: string, playerUserId: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 AS x FROM watchlist WHERE wallet = ? AND player_user_id = ?')
    .get(normalizeWallet(wallet), playerUserId);
  return Boolean(row);
}
