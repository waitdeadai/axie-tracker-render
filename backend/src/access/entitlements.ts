import { Request, Response } from 'express';
import { hasActiveAccess, hasPremium, getWatchlistConfig } from './db';

// Entitlement rule for the watchlist + alerts feature:
//   deployEnabled && hasActiveAccess(wallet) && (now < freeUntil || hasPremium(wallet))
// With the far-future default freeUntil this is behavior-neutral — any
// access-holder is entitled (free) exactly as today.
export function hasWatchlistAccess(wallet: string, now: number = Date.now()): boolean {
  const { deployEnabled, freeUntil } = getWatchlistConfig();
  if (!deployEnabled) {
    return false;
  }
  if (!hasActiveAccess(wallet, now)) {
    return false;
  }
  return now < freeUntil || hasPremium(wallet, now);
}

function sessionWallet(req: Request): string | null {
  return req.session?.siweAddress ?? null;
}

// Guard for the watchlist routes. Mirrors requirePaidWallet's shape (routes.ts):
// 401 when there's no signed-in wallet, 402 when the wallet isn't entitled to
// the add-on (carrying an upsell hint), else returns the wallet. Returns null
// after sending the error response.
export function requireWatchlistWallet(req: Request, res: Response): string | null {
  const wallet = sessionWallet(req);
  if (!wallet) {
    res.status(401).json({ error: 'No wallet session — complete SIWE first' });
    return null;
  }
  if (!hasWatchlistAccess(wallet)) {
    res.status(402).json({
      error: 'Rival watchlist is a Premium add-on — hold a launch pass or upgrade',
      upsell: 'watchlist_addon'
    });
    return null;
  }
  return wallet;
}
