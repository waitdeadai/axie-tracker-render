import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { getAddress } from 'ethers';
import { PlanId } from './plans';

// Single source of truth for watchlist tiering config. Read lazily from env
// (no dependency on config.ts's eager required-env load, which throws on a
// missing API_KEY). BOTH the displayed status (getStatus, below) and the
// enforced route guard (entitlements.requireWatchlistWallet) import this, so the
// gate the frontend sees can never drift from the gate the backend enforces.
// Far-future freeUntil => behavior-neutral (any access-holder keeps the watchlist).
export function getWatchlistConfig(): { deployEnabled: boolean; freeUntil: number } {
  const deployEnabled = (process.env.WATCHLIST_DEPLOY_ENABLED ?? 'true') !== 'false';
  const raw = Number(process.env.WATCHLIST_FREE_UNTIL ?? 32503680000000);
  const freeUntil = Number.isFinite(raw) ? raw : 32503680000000;
  return { deployEnabled, freeUntil };
}

let db: Database.Database | null = null;

function getDbPath(): string {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'access.db');
}

// Wallets are stored in EIP-55 checksum form so equality checks are stable.
export function normalizeWallet(wallet: string): string {
  return getAddress(wallet.trim());
}

export interface Subscription {
  wallet: string;
  plan: PlanId;
  started_at: number;
  expires_at: number;
}

export interface ConsumedTx {
  tx_hash: string;
  wallet: string;
  amount: string;
  block_number: number;
  observed_at: number;
}

export interface WhitelistEntry {
  wallet: string;
  reason: string;
  until: number;
}

export interface PremiumGrant {
  wallet: string;
  until: number | null;
  reason: string;
  created_at: number;
}

export interface AccessStatus {
  address: string;
  hasAccess: boolean;
  plan: PlanId | null;
  expiresAt: number | null;
  whitelisted: boolean;
  // Watchlist + alerts tiering (additive). watchlistAccess gates the feature;
  // watchlistFree flags it's currently included free (launch window, no premium).
  watchlistAccess: boolean;
  watchlistFree: boolean;
}

export interface TxInfo {
  txHash: string;
  amount: string;
  blockNumber: number;
}

export function initAccessDb(): Database.Database {
  const dbPath = getDbPath();
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      wallet TEXT PRIMARY KEY,
      plan TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS consumed_tx (
      tx_hash TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      amount TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      observed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS whitelist (
      wallet TEXT PRIMARY KEY,
      reason TEXT NOT NULL DEFAULT '',
      until INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      wallet TEXT NOT NULL,
      player_user_id TEXT NOT NULL,
      player_name TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      PRIMARY KEY (wallet, player_user_id)
    );

    CREATE TABLE IF NOT EXISTS premium_grants (
      wallet TEXT PRIMARY KEY,
      until INTEGER,
      reason TEXT,
      created_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_whitelist_until ON whitelist(until);
    CREATE INDEX IF NOT EXISTS idx_watchlist_wallet ON watchlist(wallet);
  `);
  console.log(`Access database initialized at: ${dbPath}`);
  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Access DB not initialized — call initAccessDb() first');
  }
  return db;
}

export function closeAccessDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function getSubscription(wallet: string): Subscription | undefined {
  return getDb()
    .prepare('SELECT * FROM subscriptions WHERE wallet = ?')
    .get(normalizeWallet(wallet)) as Subscription | undefined;
}

export function getWhitelistEntry(wallet: string): WhitelistEntry | undefined {
  return getDb()
    .prepare('SELECT * FROM whitelist WHERE wallet = ?')
    .get(normalizeWallet(wallet)) as WhitelistEntry | undefined;
}

export function isWhitelisted(wallet: string, now: number = Date.now()): boolean {
  const entry = getWhitelistEntry(wallet);
  return Boolean(entry && entry.until > now);
}

export function hasActiveAccess(wallet: string, now: number = Date.now()): boolean {
  const sub = getSubscription(wallet);
  if (sub && sub.expires_at > now) {
    return true;
  }
  return isWhitelisted(wallet, now);
}

export function getPremiumGrant(wallet: string): PremiumGrant | undefined {
  return getDb()
    .prepare('SELECT * FROM premium_grants WHERE wallet = ?')
    .get(normalizeWallet(wallet)) as PremiumGrant | undefined;
}

// Premium = an unexpired premium_grants row (until null means no expiry), OR a
// whitelist reason that reads as premium/founder. Used by the watchlist add-on
// gate to keep a wallet entitled even after the free launch window closes.
export function hasPremium(wallet: string, now: number = Date.now()): boolean {
  const grant = getPremiumGrant(wallet);
  if (grant && (grant.until == null || grant.until > now)) {
    return true;
  }
  const wl = getWhitelistEntry(wallet);
  return Boolean(wl && wl.until > now && /premium|founder/i.test(wl.reason));
}

// Records/refreshes a premium grant. `until` null = no expiry.
export function grantPremium(
  wallet: string,
  until: number | null,
  reason: string,
  now: number = Date.now()
): PremiumGrant {
  const normalized = normalizeWallet(wallet);
  getDb()
    .prepare(
      `INSERT INTO premium_grants (wallet, until, reason, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(wallet) DO UPDATE SET
         until = excluded.until,
         reason = excluded.reason`
    )
    .run(normalized, until, reason, now);
  return { wallet: normalized, until, reason, created_at: now };
}

// Grants/extends a time-boxed subscription. Extends from whichever is later:
// an unexpired existing subscription or now — so stacking plans adds time.
export function grantAccess(
  wallet: string,
  plan: PlanId,
  durationMs: number,
  txInfo: TxInfo,
  now: number = Date.now()
): Subscription {
  const normalized = normalizeWallet(wallet);
  const dbInstance = getDb();

  const result = dbInstance.transaction(() => {
    consumeTx(txInfo.txHash, normalized, txInfo.amount, txInfo.blockNumber, now);

    const existing = getSubscription(normalized);
    const base = existing && existing.expires_at > now ? existing.expires_at : now;
    const expiresAt = base + durationMs;

    dbInstance
      .prepare(
        `INSERT INTO subscriptions (wallet, plan, started_at, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(wallet) DO UPDATE SET
           plan = excluded.plan,
           expires_at = excluded.expires_at`
      )
      .run(normalized, plan, now, expiresAt);

    return { wallet: normalized, plan, started_at: now, expires_at: expiresAt } as Subscription;
  })();

  return result;
}

// Records a tx as consumed. Throws on replay (PK conflict) so the caller can
// reject a duplicate claim. Must be called inside grantAccess's transaction.
export function consumeTx(
  txHash: string,
  wallet: string,
  amount: string,
  blockNumber: number,
  now: number = Date.now()
): void {
  const info = getDb()
    .prepare('SELECT tx_hash FROM consumed_tx WHERE tx_hash = ?')
    .get(txHash.toLowerCase()) as { tx_hash: string } | undefined;
  if (info) {
    throw new TxAlreadyConsumedError(txHash);
  }
  getDb()
    .prepare(
      `INSERT INTO consumed_tx (tx_hash, wallet, amount, block_number, observed_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(txHash.toLowerCase(), normalizeWallet(wallet), amount, blockNumber, now);
}

export function isTxConsumed(txHash: string): boolean {
  const row = getDb()
    .prepare('SELECT tx_hash FROM consumed_tx WHERE tx_hash = ?')
    .get(txHash.toLowerCase()) as { tx_hash: string } | undefined;
  return Boolean(row);
}

export function upsertWhitelist(wallet: string, until: number, reason: string): WhitelistEntry {
  const normalized = normalizeWallet(wallet);
  getDb()
    .prepare(
      `INSERT INTO whitelist (wallet, reason, until)
       VALUES (?, ?, ?)
       ON CONFLICT(wallet) DO UPDATE SET reason = excluded.reason, until = excluded.until`
    )
    .run(normalized, reason, until);
  return { wallet: normalized, reason, until };
}

export function getStatus(wallet: string, now: number = Date.now()): AccessStatus {
  const normalized = normalizeWallet(wallet);
  const sub = getSubscription(normalized);
  const whitelisted = isWhitelisted(normalized, now);
  const subActive = Boolean(sub && sub.expires_at > now);

  let plan: PlanId | null = null;
  let expiresAt: number | null = null;
  if (subActive && sub) {
    plan = sub.plan;
    expiresAt = sub.expires_at;
  }

  const hasAccess = subActive || whitelisted;

  // Watchlist tiering. With the far-future default freeUntil this stays
  // behavior-neutral: any access-holder gets watchlistAccess true (free).
  const { deployEnabled, freeUntil } = getWatchlistConfig();
  const premium = hasPremium(normalized, now);
  const withinFreeWindow = now < freeUntil;
  const watchlistAccess = deployEnabled && hasAccess && (withinFreeWindow || premium);
  const watchlistFree = withinFreeWindow && !premium;

  return {
    address: normalized,
    hasAccess,
    plan,
    expiresAt,
    whitelisted,
    watchlistAccess,
    watchlistFree
  };
}

export class TxAlreadyConsumedError extends Error {
  constructor(txHash: string) {
    super(`Transaction already consumed: ${txHash}`);
    this.name = 'TxAlreadyConsumedError';
  }
}
