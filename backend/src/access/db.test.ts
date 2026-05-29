import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  initAccessDb,
  closeAccessDb,
  grantAccess,
  hasActiveAccess,
  isTxConsumed,
  upsertWhitelist,
  isWhitelisted,
  getStatus,
  hasPremium,
  grantPremium,
  TxAlreadyConsumedError
} from './db';

const WALLET = '0x51a8318fbff6ddfee50ee0fb0f33af02f34ff649';
const TX = '0x' + 'ab'.repeat(32);

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'access-test-'));
  process.env.DATA_DIR = dir;
  initAccessDb();
});

afterEach(() => {
  closeAccessDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('access store', () => {
  it('grants time-boxed access and dedupes the tx', () => {
    const sub = grantAccess(WALLET, '2weeks', 14 * 86400_000, {
      txHash: TX,
      amount: '2000000',
      blockNumber: 100
    });
    expect(sub.plan).toBe('2weeks');
    expect(hasActiveAccess(WALLET)).toBe(true);
    expect(isTxConsumed(TX)).toBe(true);
  });

  it('rejects a replayed tx', () => {
    grantAccess(WALLET, '2weeks', 14 * 86400_000, { txHash: TX, amount: '2000000', blockNumber: 1 });
    expect(() =>
      grantAccess(WALLET, '2weeks', 14 * 86400_000, { txHash: TX, amount: '2000000', blockNumber: 1 })
    ).toThrow(TxAlreadyConsumedError);
  });

  it('expired subscription is not active', () => {
    grantAccess(WALLET, '2weeks', -1000, { txHash: TX, amount: '2000000', blockNumber: 1 });
    expect(hasActiveAccess(WALLET)).toBe(false);
  });

  it('whitelist grants access until expiry', () => {
    const other = '0x000000000000000000000000000000000000dEaD';
    upsertWhitelist(other, Date.now() + 60_000, 'season pass');
    expect(isWhitelisted(other)).toBe(true);
    expect(getStatus(other).hasAccess).toBe(true);
    expect(getStatus(other).whitelisted).toBe(true);
  });
});

describe('watchlist tiering', () => {
  const ENV_KEYS = ['WATCHLIST_FREE_UNTIL', 'WATCHLIST_DEPLOY_ENABLED'] as const;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  // The load-bearing guarantee: with the far-future default cutoff, EVERY current
  // access-holder keeps the watchlist exactly as today (included free).
  it('default (far-future freeUntil) is a no-op: any access-holder is entitled and free', () => {
    delete process.env.WATCHLIST_FREE_UNTIL; // fall back to the far-future default
    delete process.env.WATCHLIST_DEPLOY_ENABLED;
    grantAccess(WALLET, '2weeks', 14 * 86400_000, { txHash: TX, amount: '2000000', blockNumber: 1 });
    const s = getStatus(WALLET);
    expect(s.hasAccess).toBe(true);
    expect(s.watchlistAccess).toBe(true);
    expect(s.watchlistFree).toBe(true);
  });

  it('no base access => no watchlist access, even in the free window', () => {
    delete process.env.WATCHLIST_FREE_UNTIL;
    const s = getStatus('0x000000000000000000000000000000000000dEaD');
    expect(s.hasAccess).toBe(false);
    expect(s.watchlistAccess).toBe(false);
  });

  it('after the free window closes, a plain access-holder loses watchlist access', () => {
    process.env.WATCHLIST_FREE_UNTIL = '1'; // epoch-ms in the distant past
    grantAccess(WALLET, '2weeks', 14 * 86400_000, { txHash: TX, amount: '2000000', blockNumber: 1 });
    const s = getStatus(WALLET);
    expect(s.hasAccess).toBe(true);
    expect(s.watchlistAccess).toBe(false);
    expect(s.watchlistFree).toBe(false);
  });

  it('a premium grant keeps watchlist access after the free window', () => {
    process.env.WATCHLIST_FREE_UNTIL = '1';
    grantAccess(WALLET, '2weeks', 14 * 86400_000, { txHash: TX, amount: '2000000', blockNumber: 1 });
    grantPremium(WALLET, null, 'addon-purchase'); // null until = no expiry
    expect(hasPremium(WALLET)).toBe(true);
    const s = getStatus(WALLET);
    expect(s.watchlistAccess).toBe(true);
    expect(s.watchlistFree).toBe(false); // premium, not the free launch window
  });

  it('a premium/founder whitelist reason counts as premium', () => {
    process.env.WATCHLIST_FREE_UNTIL = '1';
    const founder = '0x000000000000000000000000000000000000dEaD';
    upsertWhitelist(founder, Date.now() + 60_000, 'Founder seat');
    expect(hasPremium(founder)).toBe(true);
    expect(getStatus(founder).watchlistAccess).toBe(true);
  });

  it('a non-premium whitelist reason does NOT count as premium', () => {
    process.env.WATCHLIST_FREE_UNTIL = '1';
    const other = '0x000000000000000000000000000000000000dEaD';
    upsertWhitelist(other, Date.now() + 60_000, 'season pass');
    expect(hasPremium(other)).toBe(false);
    expect(getStatus(other).watchlistAccess).toBe(false);
  });

  it('deployEnabled=false gates everyone, even in the free window', () => {
    delete process.env.WATCHLIST_FREE_UNTIL;
    process.env.WATCHLIST_DEPLOY_ENABLED = 'false';
    grantAccess(WALLET, '2weeks', 14 * 86400_000, { txHash: TX, amount: '2000000', blockNumber: 1 });
    expect(getStatus(WALLET).watchlistAccess).toBe(false);
  });
});
