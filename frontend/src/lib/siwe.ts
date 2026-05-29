import { RONIN_CHAIN_ID, signMessage } from './wallet';
import { getNonce, verifySiwe, TokenManager, type VerifyResponse } from './api';

// ASCII only. The EIP-4361 statement is one line and the backend's SIWE parser
// rejects non-ASCII (e.g. an em-dash), so keep this plain ASCII.
const SIWE_STATEMENT =
  'Sign in to access the live Axie ladder tracker. This is a free signature - it does not move any funds.';

// Build the EIP-4361 message STRING by hand — we deliberately do NOT use siwe's
// SiweMessage on the client. Its parser (apg-js) calls Buffer.from(), and
// `Buffer` is undefined in the browser (Vite externalizes the 'buffer' module),
// so `new SiweMessage(...)` threw "Cannot read properties of undefined
// (reading 'from')" and broke sign-in for every user. The backend (Node, real
// Buffer) parses + verifies this exact canonical string.
function buildSiweMessage(address: string, nonce: string): string {
  return [
    `${window.location.host} wants you to sign in with your Ethereum account:`,
    address,
    '',
    SIWE_STATEMENT,
    '',
    `URI: ${window.location.origin}`,
    'Version: 1',
    `Chain ID: ${RONIN_CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`
  ].join('\n');
}

// Full EIP-4361 flow: fetch a session-bound nonce, build the message, sign it
// with the connected wallet, and POST for verification. On success the server
// returns a JWT which we persist for the gated data routes.
export async function siweSignIn(address: string): Promise<VerifyResponse> {
  const nonce = await getNonce();
  const message = buildSiweMessage(address, nonce);

  const signature = await signMessage(message, address);
  const result = await verifySiwe(message, signature);

  if (result.token) {
    TokenManager.setToken(result.token);
  }

  return result;
}
