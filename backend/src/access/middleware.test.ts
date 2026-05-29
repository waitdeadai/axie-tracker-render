import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

function mockRes() {
  const r: any = {
    code: 0,
    body: null,
    status(c: number) { r.code = c; return r; },
    json(b: any) { r.body = b; return r; }
  };
  return r;
}

let tmpDir: string;

describe('requireAccess (paywall gate)', () => {
  let db: any;
  let mw: any;
  const W = '0x51a8318FBFf6DDFee50Ee0fb0f33AF02F34fF649';

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-test-'));
    process.env.DATA_DIR = tmpDir;
    process.env.JWT_SECRET = 'test-secret-123';
    db = await import('./db');
    db.initAccessDb();
    mw = await import('./middleware');
  });

  afterEach(() => {
    try { db.closeAccessDb(); } catch { /* ignore */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('401 when there is no wallet (no session, no token)', () => {
    const res = mockRes();
    const next = vi.fn();
    mw.requireAccess({ headers: {}, session: undefined } as any, res, next);
    expect(res.code).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('402 when signed in (session) but no active access', () => {
    const res = mockRes();
    const next = vi.fn();
    mw.requireAccess({ headers: {}, session: { siweAddress: W } } as any, res, next);
    expect(res.code).toBe(402);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes when the wallet is whitelisted (session path)', () => {
    db.upsertWhitelist(W, Date.now() + 3_600_000, 'test');
    const res = mockRes();
    const next = vi.fn();
    mw.requireAccess({ headers: {}, session: { siweAddress: W } } as any, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.code).toBe(0);
  });

  it('passes via a valid JWT Bearer for an entitled wallet', async () => {
    db.upsertWhitelist(W, Date.now() + 3_600_000, 'test');
    const jwt = await import('../auth/jwt');
    const token = jwt.generateToken(W);
    const res = mockRes();
    const next = vi.fn();
    mw.requireAccess({ headers: { authorization: `Bearer ${token}` }, session: undefined } as any, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('401 on a garbage Bearer token', () => {
    const res = mockRes();
    const next = vi.fn();
    mw.requireAccess({ headers: { authorization: 'Bearer not.a.jwt' }, session: undefined } as any, res, next);
    expect(res.code).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
