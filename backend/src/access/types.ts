import 'express-session';

declare module 'express-session' {
  interface SessionData {
    // Single-use SIWE nonce bound to this session.
    siweNonce?: string;
    siweNonceIssuedAt?: number;
    // The wallet that has completed SIWE verification in this session.
    siweAddress?: string;
  }
}
