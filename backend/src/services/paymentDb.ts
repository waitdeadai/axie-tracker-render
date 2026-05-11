import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';

let db: Database.Database;

function getDbPath(): string {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'payments.db');
}

export interface PaymentSession {
  id: string;
  user_address: string;
  plan: string;
  token: string;
  expected_amount: string;
  status: 'pending' | 'confirmed' | 'expired' | 'failed';
  tx_hash: string | null;
  created_at: number;
  expires_at: number;
  confirmed_at: number | null;
  api_key: string | null; // stored in plaintext so user can retrieve it
}

export interface ApiKeyRecord {
  id: string;
  key_hash: string;
  user_address: string;
  plan: string;
  created_at: number;
  expires_at: number;
  active: number;
}

function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(16);
  const hexString = randomBytes.toString('hex');
  return `axs_${hexString}`;
}

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function initPaymentDb(): Database.Database {
  const dbPath = getDbPath();
  db = new Database(dbPath);
  console.log(`💳 Using payment database at: ${dbPath}`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_sessions (
      id TEXT PRIMARY KEY,
      user_address TEXT NOT NULL,
      plan TEXT NOT NULL,
      token TEXT NOT NULL,
      expected_amount TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      tx_hash TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      confirmed_at INTEGER,
      api_key TEXT
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,
      user_address TEXT NOT NULL,
      plan TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      active INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON payment_sessions(user_address);
    CREATE INDEX IF NOT EXISTS idx_keys_hash ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_keys_expires ON api_keys(expires_at);
  `);

  return db;
}

export function createSession(
  userAddress: string,
  plan: string,
  token: string,
  amount: string
): string {
  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + 15 * 60 * 1000; // 15 minutes

  const stmt = db.prepare(`
    INSERT INTO payment_sessions (id, user_address, plan, token, expected_amount, status, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `);

  stmt.run(id, userAddress, plan, token, amount, now, expiresAt);
  return id;
}

export function getSession(sessionId: string): PaymentSession | undefined {
  const stmt = db.prepare('SELECT * FROM payment_sessions WHERE id = ?');
  return stmt.get(sessionId) as PaymentSession | undefined;
}

export function confirmSession(sessionId: string, txHash: string, apiKey?: string): void {
  const now = Date.now();
  const stmt = db.prepare(`
    UPDATE payment_sessions
    SET status = 'confirmed', tx_hash = ?, confirmed_at = ?, api_key = ?
    WHERE id = ?
  `);
  stmt.run(txHash, now, apiKey ?? null, sessionId);
}

export function expireSession(sessionId: string): void {
  const stmt = db.prepare(`
    UPDATE payment_sessions SET status = 'expired' WHERE id = ? AND status = 'pending'
  `);
  stmt.run(sessionId);
}

export function getPendingSessions(): PaymentSession[] {
  const now = Date.now();
  const stmt = db.prepare(`
    SELECT * FROM payment_sessions
    WHERE status = 'pending' AND expires_at > ?
  `);
  return stmt.all(now) as PaymentSession[];
}

export function getExpiredPendingSessions(): PaymentSession[] {
  const now = Date.now();
  const stmt = db.prepare(`
    SELECT * FROM payment_sessions
    WHERE status = 'pending' AND expires_at <= ?
  `);
  return stmt.all(now) as PaymentSession[];
}

export function cleanupExpiredSessions(): number {
  const sessions = getExpiredPendingSessions();
  for (const session of sessions) {
    expireSession(session.id);
  }
  return sessions.length;
}

export interface CreateApiKeyResult {
  id: string;
  key: string;
}

export function createApiKey(userAddress: string, plan: string, expiresAt: number): CreateApiKeyResult {
  const id = crypto.randomUUID();
  const key = generateApiKey();
  const keyHash = hashApiKey(key);
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO api_keys (id, key_hash, user_address, plan, created_at, expires_at, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  stmt.run(id, keyHash, userAddress, plan, now, expiresAt);

  return { id, key };
}

export interface ValidateApiKeyResult {
  valid: boolean;
  userAddress: string;
  plan: string;
  expiresAt: number;
}

export function validateApiKey(key: string): ValidateApiKeyResult | null {
  const keyHash = hashApiKey(key);
  const now = Date.now();

  const stmt = db.prepare(`
    SELECT * FROM api_keys
    WHERE key_hash = ? AND active = 1 AND expires_at > ?
  `);

  const record = stmt.get(keyHash, now) as ApiKeyRecord | undefined;

  if (!record) {
    return null;
  }

  return {
    valid: true,
    userAddress: record.user_address,
    plan: record.plan,
    expiresAt: record.expires_at
  };
}

export function deactivateApiKey(keyHash: string): void {
  const stmt = db.prepare('UPDATE api_keys SET active = 0 WHERE key_hash = ?');
  stmt.run(keyHash);
}

export function getPaymentDb(): Database.Database {
  return db;
}

export function closePaymentDb(): void {
  if (db) {
    db.close();
  }
}
