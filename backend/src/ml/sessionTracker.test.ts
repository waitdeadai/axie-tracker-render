import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ActivePlayer } from '../core/types';

// The tracker reads process.env.DATA_DIR in its constructor, so we point it at a
// throwaway dir before instantiating. Timestamps are injected (processPlayerActivity
// takes an optional `now`) so the session math is fully deterministic.
let tmpDir: string;

function player(vstar: number): ActivePlayer {
  return {
    userId: 'u1',
    name: 'TestPlayer',
    rank: 'Challenger',
    topRank: 5,
    vstar,
    rankChange: 0,
    battleEndedAt: 0,
    recent: true,
    won: true,
    axies: [],
  };
}

describe('LocalSessionTracker (the ML moat: sessions.db must actually fill, with TRUE session spans)', () => {
  let tracker: any;
  // Recent base time so rows fall inside getRecentSessions' 30-day window.
  const t0 = Date.now() - 60 * 60 * 1000;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessions-test-'));
    process.env.DATA_DIR = tmpDir;
    const mod = await import('./sessionTracker');
    tracker = new mod.LocalSessionTracker();
  });

  afterEach(() => {
    try { tracker?.close(); } catch { /* ignore */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('persists a multi-game session with the TRUE start→end span (start -> continue -> gap)', () => {
    tracker.processPlayerActivity(player(100), t0);                  // start
    expect(tracker.getActiveSessions().size).toBe(1);
    tracker.processPlayerActivity(player(103), t0 + 3 * 60_000);     // continue (game 2, +3 vstar)
    // A >10min gap closes the prior session (ended at its last game) and opens a new one.
    tracker.processPlayerActivity(player(103), t0 + 20 * 60_000);

    expect(tracker.getSessionCount('u1')).toBe(1);
    const recent = tracker.getRecentSessions('u1');
    expect(recent).toHaveLength(1);
    expect(recent[0].games_played).toBe(2);
    expect(recent[0].vstar_start).toBe(100);
    expect(recent[0].vstar_end).toBe(103);
    expect(recent[0].vstar_change).toBe(3);
    // TRUE span = start(t0) -> last game(t0+3min) = 3 minutes (not under-counted to ~0).
    expect(recent[0].duration_minutes).toBe(3);
    // hour_of_day is derived from the TRUE start, not the last activity.
    expect(recent[0].hour_of_day).toBe(new Date(t0).getHours());
  });

  it('drops a too-short session (true span below the 2-minute minimum)', () => {
    tracker.processPlayerActivity(player(100), t0);                 // start
    tracker.processPlayerActivity(player(101), t0 + 30_000);        // continue 30s later
    tracker.processPlayerActivity(player(101), t0 + 20 * 60_000);   // gap closes it — span only 30s
    expect(tracker.getSessionCount('u1')).toBe(0);
  });
});
