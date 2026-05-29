import { getAddress, zeroPadValue, getBigInt, Log } from 'ethers';
import crypto from 'crypto';
import { config } from '../config';
import { getRoninProvider } from './provider';
import {
  grantAccess,
  isTxConsumed,
  normalizeWallet,
  TxAlreadyConsumedError,
  Subscription
} from './db';
import { getPlan, planForAmount, PlanInfo } from './plans';

// ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export interface GrantResult {
  hasAccess: true;
  plan: PlanInfo['plan'];
  expiresAt: number;
  subscription: Subscription;
}

export class PaymentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'PaymentError';
    this.status = status;
  }
}

function receiverTopic(): string {
  return zeroPadValue(getAddress(config.payment.paymentWalletAddress), 32).toLowerCase();
}

function addrFromTopic(topic: string): string {
  // topic is a 32-byte left-padded address; take the last 20 bytes.
  return getAddress('0x' + topic.slice(-40));
}

function decodeTransfer(log: Log): { from: string; to: string; value: bigint } {
  return {
    from: addrFromTopic(log.topics[1]),
    to: addrFromTopic(log.topics[2]),
    value: getBigInt(log.data)
  };
}

function isUsdcTransferToReceiver(log: Log): boolean {
  return (
    log.address.toLowerCase() === config.payment.usdcContract.toLowerCase() &&
    log.topics.length >= 3 &&
    log.topics[0].toLowerCase() === TRANSFER_TOPIC &&
    log.topics[2].toLowerCase() === receiverTopic()
  );
}

async function getFinalizedBlockNumber(): Promise<number> {
  const block = await getRoninProvider().getBlock('finalized');
  if (!block) {
    throw new PaymentError('Could not read finalized head from RPC', 503);
  }
  return block.number;
}

// Core grant: applied identically by claim, poller, and webhook. Maps the
// transferred amount to the largest plan it covers, then time-boxes access.
function applyGrant(
  fromWallet: string,
  value: bigint,
  txHash: string,
  blockNumber: number,
  requirePlan?: PlanInfo
): GrantResult {
  const plan = requirePlan ?? planForAmount(value);
  if (!plan) {
    throw new PaymentError('Transfer amount is below the smallest plan price', 400);
  }
  if (value < plan.priceBaseUnits) {
    throw new PaymentError(
      `Underpayment: ${value.toString()} < required ${plan.priceBaseUnits.toString()}`,
      400
    );
  }

  const subscription = grantAccess(
    fromWallet,
    plan.plan,
    plan.durationMs,
    { txHash: txHash.toLowerCase(), amount: value.toString(), blockNumber }
  );

  return {
    hasAccess: true,
    plan: plan.plan,
    expiresAt: subscription.expires_at,
    subscription
  };
}

// POST /api/payment/claim core. Loads the tx receipt, confirms it is in a
// finalized block, finds the USDC Transfer to the owner wallet FROM the
// signed-in wallet, checks value >= plan price, dedupes, and grants.
export async function verifyAndGrant(
  txHash: string,
  signedInWallet: string,
  requestedPlan?: PlanInfo
): Promise<GrantResult> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new PaymentError('Invalid transaction hash', 400);
  }

  const wallet = normalizeWallet(signedInWallet);

  if (isTxConsumed(txHash)) {
    throw new PaymentError('Transaction already redeemed', 409);
  }

  const provider = getRoninProvider();
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    throw new PaymentError('Transaction not found or not yet mined', 404);
  }
  if (receipt.status === 0) {
    throw new PaymentError('Transaction reverted on-chain', 400);
  }

  const finalizedHead = await getFinalizedBlockNumber();
  if (receipt.blockNumber > finalizedHead) {
    throw new PaymentError(
      'Transaction is not yet finalized — wait for finality and retry',
      425
    );
  }

  const matching = receipt.logs.filter(
    (log) => isUsdcTransferToReceiver(log) && decodeTransfer(log).from === wallet
  );

  if (matching.length === 0) {
    throw new PaymentError(
      'No USDC transfer from the signed-in wallet to the owner wallet found in this transaction',
      400
    );
  }

  // Sum all matching transfers in the tx so a split transfer still counts.
  const total = matching.reduce((acc, log) => acc + decodeTransfer(log).value, 0n);

  try {
    return applyGrant(wallet, total, txHash, receipt.blockNumber, requestedPlan);
  } catch (err) {
    if (err instanceof TxAlreadyConsumedError) {
      throw new PaymentError('Transaction already redeemed', 409);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Moralis Streams webhook
// ---------------------------------------------------------------------------

// Moralis signs the raw request body as keccak/sha-style HMAC; the standard
// Streams verification is sha3(body + secret) compared to x-signature. We
// support the documented web3-secret HMAC-SHA256(body, secret) as the default
// and accept the legacy sha3 form too.
export function verifyMoralisSignature(rawBody: Buffer | string, signature: string): boolean {
  const secret = config.payment.moralisStreamSecret;
  if (!secret || !signature) {
    return false;
  }
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const provided = signature.replace(/^0x/, '').toLowerCase();
  if (timingSafeEqualHex(hmac, provided)) {
    return true;
  }

  // Legacy Moralis Streams: web3 sha3 of body+secret.
  const sha3 = crypto.createHash('sha3-256').update(body + secret).digest('hex');
  return timingSafeEqualHex(sha3, provided);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

interface MoralisErc20Transfer {
  transactionHash?: string;
  contract?: string;
  from?: string;
  to?: string;
  value?: string;
}

interface MoralisWebhookBody {
  confirmed?: boolean;
  erc20Transfers?: MoralisErc20Transfer[];
}

// Processes a verified Moralis webhook payload. Only confirmed transfers of
// USDC to the owner wallet are granted, keyed to the SENDER wallet. Uses the
// same dedupe + grant core as claim.
export function processMoralisWebhook(body: MoralisWebhookBody): GrantResult[] {
  const results: GrantResult[] = [];
  if (!body.confirmed || !Array.isArray(body.erc20Transfers)) {
    return results;
  }

  const usdc = config.payment.usdcContract.toLowerCase();
  const receiver = getAddress(config.payment.paymentWalletAddress);

  for (const t of body.erc20Transfers) {
    if (!t.transactionHash || !t.contract || !t.from || !t.to || !t.value) {
      continue;
    }
    if (t.contract.toLowerCase() !== usdc) {
      continue;
    }
    let to: string;
    let from: string;
    try {
      to = getAddress(t.to);
      from = getAddress(t.from);
    } catch {
      continue;
    }
    if (to !== receiver) {
      continue;
    }
    if (isTxConsumed(t.transactionHash)) {
      continue;
    }

    let value: bigint;
    try {
      value = BigInt(t.value);
    } catch {
      continue;
    }
    if (!planForAmount(value)) {
      continue;
    }

    try {
      // Moralis doesn't return the block number directly in every payload; use 0
      // when absent — finality is already implied by confirmed=true.
      results.push(applyGrant(from, value, t.transactionHash, 0, undefined));
    } catch (err) {
      if (err instanceof TxAlreadyConsumedError) {
        continue;
      }
      throw err;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// eth_getLogs poller (default reconcile path; works with just the public RPC)
// ---------------------------------------------------------------------------

export class PaymentPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastScannedBlock = 0;

  start(): void {
    if (this.running || !config.payment.pollEnabled) {
      if (!config.payment.pollEnabled) {
        console.log('[PaymentPoller] disabled via PAYMENT_POLL_ENABLED=false');
      }
      return;
    }
    this.running = true;
    console.log('[PaymentPoller] starting eth_getLogs reconcile loop');
    void this.tick();
    this.timer = setInterval(() => void this.tick(), config.payment.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  private async tick(): Promise<void> {
    try {
      const provider = getRoninProvider();
      const finalized = await provider.getBlock('finalized');
      if (!finalized) {
        return;
      }
      const toBlock = finalized.number;

      if (this.lastScannedBlock === 0) {
        this.lastScannedBlock = Math.max(0, toBlock - config.payment.pollLookbackBlocks);
      }
      const fromBlock = this.lastScannedBlock + 1;
      if (fromBlock > toBlock) {
        return;
      }

      const logs = await provider.getLogs({
        address: config.payment.usdcContract,
        topics: [TRANSFER_TOPIC, null, receiverTopic()],
        fromBlock,
        toBlock
      });

      for (const log of logs) {
        if (!isUsdcTransferToReceiver(log)) {
          continue;
        }
        const txHash = log.transactionHash;
        if (isTxConsumed(txHash)) {
          continue;
        }
        const { from, value } = decodeTransfer(log);
        if (!planForAmount(value)) {
          continue;
        }
        try {
          const granted = applyGrant(from, value, txHash, log.blockNumber, undefined);
          console.log(
            `[PaymentPoller] granted ${granted.plan} to ${from} via tx ${txHash}`
          );
        } catch (err) {
          if (!(err instanceof TxAlreadyConsumedError)) {
            console.error('[PaymentPoller] grant error:', err);
          }
        }
      }

      this.lastScannedBlock = toBlock;
    } catch (err) {
      console.error('[PaymentPoller] tick error:', err instanceof Error ? err.message : err);
    }
  }
}

let pollerInstance: PaymentPoller | null = null;

export function startPaymentPoller(): void {
  if (!pollerInstance) {
    pollerInstance = new PaymentPoller();
  }
  pollerInstance.start();
}

export function stopPaymentPoller(): void {
  if (pollerInstance) {
    pollerInstance.stop();
  }
}

export { getPlan };
