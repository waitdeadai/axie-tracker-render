import { SiweMessage } from 'siwe';
import { RONIN_CHAIN_ID, signMessage } from './wallet';
import { getNonce, verifySiwe, TokenManager, type VerifyResponse } from './api';

// ASCII only: the EIP-4361 (SIWE) statement grammar rejects non-ASCII characters
// (e.g. an em-dash), which makes siwe's SiweMessage parser throw — that was the
// "Cannot read properties of undefined (reading 'from')" sign-in crash. Keep
// this line plain ASCII.
const SIWE_STATEMENT =
  'Sign in to access the live Axie ladder tracker. This is a free signature - it does not move any funds.';

// Full EIP-4361 flow: fetch a session-bound nonce, build the message with
// siwe.prepareMessage() (byte-identical to what the backend SiweMessage parser
// reconstructs), sign it with the connected wallet, and POST for verification.
// On success the server returns a JWT which we persist for the gated data routes.
export async function siweSignIn(address: string): Promise<VerifyResponse> {
  const nonce = await getNonce();

  const message = new SiweMessage({
    domain: window.location.host,
    address,
    statement: SIWE_STATEMENT,
    uri: window.location.origin,
    version: '1',
    chainId: RONIN_CHAIN_ID,
    nonce,
    issuedAt: new Date().toISOString()
  }).prepareMessage();

  const signature = await signMessage(message, address);
  const result = await verifySiwe(message, signature);

  if (result.token) {
    TokenManager.setToken(result.token);
  }

  return result;
}
