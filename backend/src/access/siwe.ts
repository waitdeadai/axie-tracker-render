import { Request } from 'express';
import { SiweMessage, generateNonce } from 'siwe';
import { getAddress } from 'ethers';
import { config } from '../config';
import './types';

const NONCE_TTL_MS = 10 * 60 * 1000;

export function issueNonce(req: Request): string {
  const nonce = generateNonce();
  req.session.siweNonce = nonce;
  req.session.siweNonceIssuedAt = Date.now();
  return nonce;
}

export interface SiweVerifyResult {
  address: string;
}

export class SiweVerifyError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'SiweVerifyError';
    this.status = status;
  }
}

// Verifies an EIP-4361 message + signature server-side against the
// session-issued nonce, then pins the resulting wallet onto the session.
// Enforces single-use nonce, chainId 2020, and domain when configured.
export async function verifySiwe(
  req: Request,
  message: string,
  signature: string
): Promise<SiweVerifyResult> {
  if (typeof message !== 'string' || typeof signature !== 'string' || !message || !signature) {
    throw new SiweVerifyError('message and signature are required', 400);
  }

  const expectedNonce = req.session.siweNonce;
  const issuedAt = req.session.siweNonceIssuedAt ?? 0;

  if (!expectedNonce) {
    throw new SiweVerifyError('No nonce issued for this session — request /api/auth/nonce first', 400);
  }
  if (Date.now() - issuedAt > NONCE_TTL_MS) {
    clearNonce(req);
    throw new SiweVerifyError('Nonce expired — request a new one', 401);
  }

  let siweMessage: SiweMessage;
  try {
    siweMessage = new SiweMessage(message);
  } catch {
    throw new SiweVerifyError('Malformed SIWE message', 400);
  }

  if (siweMessage.chainId !== config.payment.chainId) {
    throw new SiweVerifyError(`Wrong chainId — expected ${config.payment.chainId}`, 401);
  }

  const expectedDomain = getExpectedDomain(req);

  let result;
  try {
    result = await siweMessage.verify({
      signature,
      nonce: expectedNonce,
      ...(expectedDomain ? { domain: expectedDomain } : {})
    });
  } catch (err) {
    throw new SiweVerifyError(
      err instanceof Error ? `SIWE verification failed: ${err.message}` : 'SIWE verification failed',
      401
    );
  }

  if (!result.success) {
    throw new SiweVerifyError('SIWE signature verification failed', 401);
  }

  // Single-use: burn the nonce so the same message can't be replayed.
  clearNonce(req);

  const address = getAddress(result.data.address);
  req.session.siweAddress = address;

  return { address };
}

function getExpectedDomain(req: Request): string | undefined {
  const configured = (process.env.SIWE_DOMAIN || '').trim();
  if (configured) {
    return configured;
  }
  const frontend = (process.env.FRONTEND_URL || '').trim();
  if (frontend) {
    try {
      return new URL(frontend).host;
    } catch {
      // fall through
    }
  }
  const host = req.headers.host;
  return typeof host === 'string' && host ? host : undefined;
}

function clearNonce(req: Request): void {
  req.session.siweNonce = undefined;
  req.session.siweNonceIssuedAt = undefined;
}
