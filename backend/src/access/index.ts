import { Express } from 'express';
import { initAccessDb, closeAccessDb } from './db';
import { startPaymentPoller, stopPaymentPoller } from './paymentVerifier';
import { accessRouter } from './routes';
import { sessionMiddleware } from '../auth/session';

// Wires the SOTA-2026 on-chain access system into the Express app:
//  - express-session (SIWE nonce + wallet binding)
//  - access/auth/payment routes under /api
// The eth_getLogs poller and DB are started/stopped separately by the server
// lifecycle (initAccess / startAccess / stopAccess).
export function mountAccess(app: Express): void {
  app.use(sessionMiddleware);
  app.use('/api', accessRouter);
}

export function initAccess(): void {
  initAccessDb();
}

export function startAccess(): void {
  startPaymentPoller();
}

export function stopAccess(): void {
  stopPaymentPoller();
  closeAccessDb();
}

export { accessRouter } from './routes';
export { hasActiveAccess, isWhitelisted, getStatus } from './db';
