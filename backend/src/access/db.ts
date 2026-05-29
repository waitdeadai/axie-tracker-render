import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { getAddress } from 'ethers';
import { PlanId } from './plans';

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

export interface AccessStatus {
  address: string;
  hasAccess: boolean;
  plan: PlanId | null;
  expiresAt: number | null;
  whitelisted: boolean;
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

    CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_whitelist_until ON whitelist(until);
  `);
  console.log(`Access database initialized at: ${dbPath}`);
  return db;
}

function getDb(): Database.Database {
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

  return {
    address: normalized,
    hasAccess: subActive || whitelisted,
    plan,
    expiresAt,
    whitelisted
  };
}

export class TxAlreadyConsumedError extends Error {
  constructor(txHash: string) {
    super(`Transaction already consumed: ${txHash}`);
    this.name = 'TxAlreadyConsumedError';
  }
}
