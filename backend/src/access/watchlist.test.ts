import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmpDir: string;

describe('watchlist (rival pinning, per-wallet, paid feature)', () => {
  let db: any;
  let wl: any;
  const W = '0x51a8318FBFf6DDFee50Ee0fb0f33AF02F34fF649';

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-test-'));
    process.env.DATA_DIR = tmpDir;
    db = await import('./db');
    db.initAccessDb();
    wl = await import('./watchlist');
  });

  afterEach(() => {
    try { db.closeAccessDb(); } catch { /* ignore */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('adds, lists, upserts (no dup), and removes pinned rivals', () => {
    wl.addWatch(W, 'player-1', 'Rival One');
    wl.addWatch(W, 'player-2', 'Rival Two');
    wl.addWatch(W, 'player-1', 'Rival One Renamed'); // PK conflict -> upsert
    expect(wl.getWatchlist(W)).toHaveLength(2);
    expect(wl.isWatching(W, 'player-1')).toBe(true);
    const p1 = wl.getWatchlist(W).find((x: any) => x.player_user_id === 'player-1');
    expect(p1.player_name).toBe('Rival One Renamed');
    wl.removeWatch(W, 'player-1');
    expect(wl.isWatching(W, 'player-1')).toBe(false);
    expect(wl.getWatchlist(W)).toHaveLength(1);
  });

  it('scopes per-wallet (no cross-leak) and normalizes address case', () => {
    const W2 = '0x1111111111111111111111111111111111111111';
    wl.addWatch(W, 'player-9', 'Nine');
    expect(wl.getWatchlist(W2)).toHaveLength(0);
    expect(wl.isWatching(W.toLowerCase(), 'player-9')).toBe(true); // checksum-normalized
  });
});
