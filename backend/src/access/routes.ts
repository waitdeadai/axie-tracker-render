import { Router, Request, Response } from 'express';
import { config } from '../config';
import { generateToken } from '../auth/jwt';
import { issueNonce, verifySiwe, SiweVerifyError } from './siwe';
import { verifyAndGrant, processMoralisWebhook, verifyMoralisSignature, PaymentError } from './paymentVerifier';
import { getStatus, upsertWhitelist, normalizeWallet, hasActiveAccess } from './db';
import { getPlan, isPlanId, humanAmount, planAmountBaseUnits, PlanId } from './plans';
import { addWatch, removeWatch, getWatchlist } from './watchlist';
import { state } from '../core/state';
import './types';

const router = Router();

const RECEIVER = config.payment.paymentWalletAddress;

function sessionWallet(req: Request): string | null {
  return req.session?.siweAddress ?? null;
}

// Watchlist + radar are the PAID feature: require a SIWE session AND active access
// (subscription or whitelist). Returns the wallet, or null after sending the error.
function requirePaidWallet(req: Request, res: Response): string | null {
  const wallet = sessionWallet(req);
  if (!wallet) {
    res.status(401).json({ error: 'No wallet session — complete SIWE first' });
    return null;
  }
  if (!hasActiveAccess(wallet)) {
    res.status(402).json({ error: 'Active access required — pay or get whitelisted' });
    return null;
  }
  return wallet;
}

// GET /api/auth/nonce -> { nonce }
router.get('/auth/nonce', (req: Request, res: Response) => {
  const nonce = issueNonce(req);
  res.json({ nonce });
});

// POST /api/auth/verify -> verify SIWE, establish session + JWT
router.post('/auth/verify', async (req: Request, res: Response) => {
  try {
    const { message, signature } = req.body as { message?: string; signature?: string };
    const { address } = await verifySiwe(req, message ?? '', signature ?? '');

    const status = getStatus(address);
    const token = generateToken(address);

    res.json({
      token,
      address: status.address,
      hasAccess: status.hasAccess,
      plan: status.plan,
      expiresAt: status.expiresAt,
      whitelisted: status.whitelisted
    });
  } catch (err) {
    if (err instanceof SiweVerifyError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[auth/verify] error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/auth/logout -> drop the wallet session
router.post('/auth/logout', (req: Request, res: Response) => {
  if (req.session) {
    req.session.destroy(() => res.json({ success: true }));
    return;
  }
  res.json({ success: true });
});

// GET /api/access/status -> status for the signed-in wallet
router.get('/access/status', (req: Request, res: Response) => {
  const wallet = sessionWallet(req);
  if (!wallet) {
    return res.status(401).json({ error: 'No wallet session — complete SIWE first' });
  }
  res.json(getStatus(wallet));
});

// GET /api/payment/intent?plan=2weeks -> payment instructions
router.get('/payment/intent', (req: Request, res: Response) => {
  const planParam = typeof req.query.plan === 'string' ? req.query.plan : '2weeks';
  if (!isPlanId(planParam)) {
    return res.status(400).json({ error: 'Invalid plan. Valid plans: 2weeks, 1month, 3month, 1year' });
  }
  const plan = getPlan(planParam as PlanId);
  res.json({
    to: RECEIVER,
    token: 'USDC',
    tokenContract: config.payment.usdcContract,
    chainId: config.payment.chainId,
    decimals: config.payment.usdcDecimals,
    amount: planAmountBaseUnits(plan),
    humanAmount: humanAmount(plan),
    plan: plan.plan
  });
});

// POST /api/payment/claim -> verify on-chain tx and grant access
router.post('/payment/claim', async (req: Request, res: Response) => {
  const wallet = sessionWallet(req);
  if (!wallet) {
    return res.status(401).json({ error: 'No wallet session — complete SIWE first' });
  }

  const { txHash } = req.body as { txHash?: string };
  if (!txHash || typeof txHash !== 'string') {
    return res.status(400).json({ error: 'txHash is required' });
  }

  try {
    const result = await verifyAndGrant(txHash, wallet);
    res.json({ hasAccess: result.hasAccess, expiresAt: result.expiresAt, plan: result.plan });
  } catch (err) {
    if (err instanceof PaymentError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[payment/claim] error:', err);
    res.status(500).json({ error: 'Claim verification failed' });
  }
});

// POST /api/payment/webhook/moralis -> Moralis Streams webhook
router.post('/payment/webhook/moralis', (req: Request, res: Response) => {
  const signature =
    (req.headers['x-signature'] as string | undefined) ??
    (req.headers['x-moralis-signature'] as string | undefined) ??
    '';

  const rawBody: Buffer | string =
    (req as Request & { rawBody?: Buffer }).rawBody ?? JSON.stringify(req.body ?? {});

  if (!verifyMoralisSignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid Moralis signature' });
  }

  try {
    const granted = processMoralisWebhook(req.body ?? {});
    res.json({ ok: true, granted: granted.length });
  } catch (err) {
    console.error('[payment/webhook/moralis] error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// POST /api/admin/whitelist -> admin-token guarded season whitelist
router.post('/admin/whitelist', (req: Request, res: Response) => {
  const adminToken = config.payment.adminToken;
  const provided = (req.headers['x-admin-token'] as string | undefined) ?? '';
  if (!adminToken || provided !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { address, until, reason } = req.body as {
    address?: string;
    until?: number | string;
    reason?: string;
  };
  if (!address) {
    return res.status(400).json({ error: 'address is required' });
  }

  const untilMs = typeof until === 'string' ? Number(until) : until;
  if (!untilMs || !Number.isFinite(untilMs) || untilMs <= Date.now()) {
    return res.status(400).json({ error: 'until must be a future epoch-ms timestamp' });
  }

  try {
    const entry = upsertWhitelist(address, untilMs, reason ?? '');
    res.json({ ok: true, wallet: entry.wallet, until: entry.until, reason: entry.reason });
  } catch (err) {
    console.error('[admin/whitelist] error:', err);
    res.status(400).json({ error: 'Invalid address' });
  }
});

// GET /api/watchlist -> the signed-in wallet's pinned rivals, enriched with live
// "online now" status + rank/vstar from the 1s radar (core/state).
router.get('/watchlist', (req: Request, res: Response) => {
  const wallet = requirePaidWallet(req, res);
  if (!wallet) return;

  const activeWindow = config.windows.active;
  const now = Date.now();
  const rivals = getWatchlist(wallet).map((w) => {
    const p = state.getPlayer(w.player_user_id);
    const online = Boolean(p && now - p.battleEndedAt <= activeWindow);
    return {
      playerUserId: w.player_user_id,
      playerName: p?.name || w.player_name,
      online,
      topRank: p?.topRank ?? null,
      vstar: p?.vstar ?? null,
      lastBattleAt: p?.battleEndedAt ?? null,
      won: p?.won ?? null
    };
  });
  res.json({ rivals });
});

// POST /api/watchlist { playerUserId, playerName } -> pin a rival
router.post('/watchlist', (req: Request, res: Response) => {
  const wallet = requirePaidWallet(req, res);
  if (!wallet) return;

  const { playerUserId, playerName } = req.body as { playerUserId?: string; playerName?: string };
  if (!playerUserId || typeof playerUserId !== 'string') {
    return res.status(400).json({ error: 'playerUserId is required' });
  }
  const entry = addWatch(wallet, playerUserId, playerName ?? '');
  res.json({ ok: true, playerUserId: entry.player_user_id });
});

// DELETE /api/watchlist/:playerUserId -> unpin a rival
router.delete('/watchlist/:playerUserId', (req: Request, res: Response) => {
  const wallet = requirePaidWallet(req, res);
  if (!wallet) return;
  removeWatch(wallet, req.params.playerUserId);
  res.json({ ok: true });
});

export { router as accessRouter };
