import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { zeroPadValue, getAddress, toBeHex } from 'ethers';

const USDC = '0x0b7007c13325c48911f73a2dad5fa5dcbf808adc';
const OWNER = '0x51a8318FBFf6DDFee50Ee0fb0f33AF02F34fF649';
const PAYER = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const FAKE_TOKEN = '0x3333333333333333333333333333333333333333';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TWO_USDC = 2_000_000n; // 2 * 10^6

// Mutable mock provider; getRoninProvider returns whatever we set per test.
let mockProvider: any;
vi.mock('./provider', () => ({ getRoninProvider: () => mockProvider }));

function transferLog(from: string, to: string, value: bigint, address = USDC) {
  return {
    address,
    topics: [TRANSFER_TOPIC, zeroPadValue(getAddress(from), 32), zeroPadValue(getAddress(to), 32)],
    data: toBeHex(value, 32),
    transactionHash: '0x' + 'a'.repeat(64),
    blockNumber: 100
  };
}

function receiptWith(logs: any[], opts: { status?: number; blockNumber?: number } = {}) {
  return { status: opts.status ?? 1, blockNumber: opts.blockNumber ?? 100, logs };
}

function setProvider(receipt: any, finalizedNumber = 200) {
  mockProvider = {
    getTransactionReceipt: vi.fn().mockResolvedValue(receipt),
    getBlock: vi.fn().mockResolvedValue(finalizedNumber == null ? null : { number: finalizedNumber })
  };
}

const TX = '0x' + 'a'.repeat(64);
let tmpDir: string;

describe('verifyAndGrant (the money path — adversarial)', () => {
  let pv: any;
  let db: any;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pay-test-'));
    process.env.DATA_DIR = tmpDir;
    process.env.API_KEY = 'test-key'; // config.ts requires this at load
    process.env.PAYMENT_WALLET_ADDRESS = OWNER;
    process.env.USDC_CONTRACT = USDC;
    process.env.USDC_DECIMALS = '6';
    process.env.RONIN_CHAIN_ID = '2020';
    vi.resetModules();
    db = await import('./db');
    db.initAccessDb();
    pv = await import('./paymentVerifier');
  });

  afterEach(() => {
    try { db.closeAccessDb(); } catch { /* ignore */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('grants on a correct finalized USDC transfer from the signed-in wallet', async () => {
    setProvider(receiptWith([transferLog(PAYER, OWNER, TWO_USDC)]));
    const r = await pv.verifyAndGrant(TX, PAYER);
    expect(r.hasAccess).toBe(true);
    expect(r.plan).toBe('2weeks');
    expect(db.hasActiveAccess(PAYER)).toBe(true);
  });

  it('rejects a replayed tx (409)', async () => {
    setProvider(receiptWith([transferLog(PAYER, OWNER, TWO_USDC)]));
    await pv.verifyAndGrant(TX, PAYER);
    await expect(pv.verifyAndGrant(TX, PAYER)).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a transfer FROM a different wallet than the signed-in one (no cross-claim)', async () => {
    setProvider(receiptWith([transferLog(PAYER, OWNER, TWO_USDC)]));
    await expect(pv.verifyAndGrant(TX, OTHER)).rejects.toMatchObject({ status: 400 });
    expect(db.hasActiveAccess(OTHER)).toBe(false);
  });

  it('rejects a wrong-token transfer (not USDC)', async () => {
    setProvider(receiptWith([transferLog(PAYER, OWNER, TWO_USDC, FAKE_TOKEN)]));
    await expect(pv.verifyAndGrant(TX, PAYER)).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a transfer to the wrong recipient (not the owner wallet)', async () => {
    setProvider(receiptWith([transferLog(PAYER, OTHER, TWO_USDC)]));
    await expect(pv.verifyAndGrant(TX, PAYER)).rejects.toMatchObject({ status: 400 });
  });

  it('rejects underpayment (below the smallest plan price)', async () => {
    setProvider(receiptWith([transferLog(PAYER, OWNER, 1_000_000n)]));
    await expect(pv.verifyAndGrant(TX, PAYER)).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a not-yet-finalized tx (425)', async () => {
    setProvider(receiptWith([transferLog(PAYER, OWNER, TWO_USDC)], { blockNumber: 300 }), 200);
    await expect(pv.verifyAndGrant(TX, PAYER)).rejects.toMatchObject({ status: 425 });
  });

  it('rejects a reverted tx (400) and a missing tx (404)', async () => {
    setProvider(receiptWith([transferLog(PAYER, OWNER, TWO_USDC)], { status: 0 }));
    await expect(pv.verifyAndGrant(TX, PAYER)).rejects.toMatchObject({ status: 400 });
    setProvider(null);
    await expect(pv.verifyAndGrant(TX, PAYER)).rejects.toMatchObject({ status: 404 });
  });
});
