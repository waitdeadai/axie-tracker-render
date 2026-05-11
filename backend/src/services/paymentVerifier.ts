import { ethers } from 'ethers';
import {
  getPendingSessions,
  confirmSession,
  createApiKey,
  cleanupExpiredSessions
} from './paymentDb';
import { config } from '../config';

const USDC_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export class PaymentVerifier {
  private provider: ethers.JsonRpcProvider;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private pollIntervalMs = 5000;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.payment.roninRpcUrl);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[PaymentVerifier] Starting payment verification loop');
    this.verifyPendingSessions();
    this.intervalId = setInterval(() => this.verifyPendingSessions(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[PaymentVerifier] Stopped');
  }

  async verifyPendingSessions(): Promise<void> {
    try {
      const expiredCount = cleanupExpiredSessions();
      if (expiredCount > 0) {
        console.log(`[PaymentVerifier] Expired ${expiredCount} sessions`);
      }

      const pendingSessions = getPendingSessions();
      if (pendingSessions.length === 0) return;

      console.log(`[PaymentVerifier] Checking ${pendingSessions.length} pending sessions`);

      for (const session of pendingSessions) {
        await this.checkSession(session);
      }
    } catch (error) {
      console.error('[PaymentVerifier] Error in verification loop:', error);
    }
  }

  private async checkSession(session: {
    id: string;
    user_address: string;
    plan: string;
    token: string;
    expected_amount: string;
    expires_at: number;
  }): Promise<void> {
    try {
      const serverAddress = config.payment.paymentWalletAddress.replace('ronin:', '0x');
      const latestBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - 100);

      if (session.token === 'RON') {
        await this.checkRonPayment(session, serverAddress, fromBlock, latestBlock);
      } else if (session.token === 'USDC') {
        await this.checkUsdcPayment(session, serverAddress, fromBlock, latestBlock);
      }
    } catch (error) {
      console.error(`[PaymentVerifier] Error checking session ${session.id}:`, error);
    }
  }

  private async checkRonPayment(
    session: { id: string; user_address: string; plan: string; token: string; expected_amount: string; expires_at: number },
    serverAddress: string,
    fromBlock: number,
    toBlock: number
  ): Promise<void> {
    try {
      const expectedAmount = BigInt(session.expected_amount);

      // RON is native token — no contract. Inspect transactions directly.
      // Fetch blocks sequentially to avoid overwhelming the RPC, scanning each tx.
      for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
        const block = await this.provider.getBlock(blockNum, true);
        if (!block || !block.transactions) continue;

        // block.transactions is an array of tx hashes when prefetch=false (default in some versions)
        // When prefetch=true it returns full TransactionResponse — use Promise.all to resolve all
        const txs = await Promise.all(
          block.transactions.map((tx: any) =>
            typeof tx === 'string' ? this.provider.getTransaction(tx) : tx
          )
        );

        for (const tx of txs) {
          if (
            tx.to &&
            tx.to.toLowerCase() === serverAddress.toLowerCase() &&
            tx.value >= expectedAmount
          ) {
            console.log(`[PaymentVerifier] RON payment confirmed for session ${session.id}: ${tx.value} wei`);
            const planDays = this.getPlanDays(session.plan);
            const expiresAt = Date.now() + planDays * 24 * 60 * 60 * 1000;
            const { key } = createApiKey(session.user_address, session.plan, expiresAt);
            confirmSession(session.id, tx.hash, key);
            console.log(`[PaymentVerifier] API key created for user ${session.user_address}`);
            return;
          }
        }
      }
    } catch (error) {
      console.error(`[PaymentVerifier] Error checking RON payment for session ${session.id}:`, error);
    }
  }

  private async checkUsdcPayment(
    session: { id: string; user_address: string; plan: string; token: string; expected_amount: string; expires_at: number },
    serverAddress: string,
    fromBlock: number,
    toBlock: number
  ): Promise<void> {
    try {
      const usdcContract = config.payment.usdcContract;
      const filter = {
        fromBlock,
        toBlock,
        address: usdcContract,
        topics: [
          USDC_TRANSFER_TOPIC,
          null,
          ethers.zeroPadValue(ethers.getAddress(serverAddress), 32)
        ]
      };

      const logs = await this.provider.getLogs(filter);
      const expectedAmount = BigInt(session.expected_amount);

      for (const log of logs) {
        const value = BigInt(log.data);
        if (value >= expectedAmount) {
          console.log(`[PaymentVerifier] USDC payment confirmed for session ${session.id}: ${value} units`);
          const planDays = this.getPlanDays(session.plan);
          const expiresAt = Date.now() + planDays * 24 * 60 * 60 * 1000;
          const { key } = createApiKey(session.user_address, session.plan, expiresAt);
          confirmSession(session.id, log.transactionHash, key);
          console.log(`[PaymentVerifier] API key created for user ${session.user_address}`);
          return;
        }
      }
    } catch (error) {
      console.error(`[PaymentVerifier] Error checking USDC payment for session ${session.id}:`, error);
    }
  }

  private getPlanDays(plan: string): number {
    switch (plan) {
      case '2weeks': return 14;
      case '1month': return 30;
      case '3month': return 90;
      case '1year': return 365;
      default: return 14;
    }
  }
}

let paymentVerifierInstance: PaymentVerifier | null = null;

export function getPaymentVerifier(): PaymentVerifier {
  if (!paymentVerifierInstance) {
    paymentVerifierInstance = new PaymentVerifier();
  }
  return paymentVerifierInstance;
}

export function startPaymentVerifier(): void {
  getPaymentVerifier().start();
}

export function stopPaymentVerifier(): void {
  if (paymentVerifierInstance) {
    paymentVerifierInstance.stop();
  }
}
