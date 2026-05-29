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
