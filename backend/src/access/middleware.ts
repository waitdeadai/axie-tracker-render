import { Request, Response, NextFunction } from 'express';
import { hasActiveAccess } from './db';
import { verifyToken } from '../auth/jwt';
import './types';

// Resolve the caller's wallet from either the SIWE session cookie or the JWT
// Bearer token (the frontend uses the Bearer for the data routes, the session
// cookie for the SIWE/payment routes — support both).
export function resolveWallet(req: Request): string | null {
  const sess = req.session?.siweAddress;
  if (sess) return sess;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const decoded = verifyToken(auth.slice(7));
    if (decoded?.address) return decoded.address;
  }
  return null;
}

// Gate a route on paid/whitelisted access. 401 = not signed in, 402 = signed in
// but no active access (pay or get whitelisted).
export function requireAccess(req: Request, res: Response, next: NextFunction): void {
  const wallet = resolveWallet(req);
  if (!wallet) {
    res.status(401).json({ error: 'Sign in with your Ronin wallet to continue' });
    return;
  }
  if (!hasActiveAccess(wallet)) {
    res.status(402).json({ error: 'Active access required — pay 2 USDC for 2 weeks of access' });
    return;
  }
  (req as Request & { wallet?: string }).wallet = wallet;
  next();
}
