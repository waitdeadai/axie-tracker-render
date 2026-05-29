import { config } from '../config';

export type PlanId = '2weeks' | '1month' | '3month' | '1year';

export const PLAN_IDS: readonly PlanId[] = ['2weeks', '1month', '3month', '1year'];

export interface PlanInfo {
  plan: PlanId;
  days: number;
  usdc: number;
  priceBaseUnits: bigint;
  durationMs: number;
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);
}

export function getPlan(plan: PlanId): PlanInfo {
  const def = config.payment.plans[plan];
  const decimals = config.payment.usdcDecimals;
  const priceBaseUnits = BigInt(def.usdc) * 10n ** BigInt(decimals);
  return {
    plan,
    days: def.days,
    usdc: def.usdc,
    priceBaseUnits,
    durationMs: def.days * 24 * 60 * 60 * 1000
  };
}

export function humanAmount(plan: PlanInfo): string {
  return `${plan.usdc} USDC`;
}

export function planAmountBaseUnits(plan: PlanInfo): string {
  return plan.priceBaseUnits.toString();
}

// Smallest priced plan — used by the poller/webhook to reject dust transfers
// and to map an arbitrary incoming amount to the largest plan it covers.
export function planForAmount(amount: bigint): PlanInfo | null {
  let best: PlanInfo | null = null;
  for (const id of PLAN_IDS) {
    const info = getPlan(id);
    if (amount >= info.priceBaseUnits) {
      if (!best || info.priceBaseUnits > best.priceBaseUnits) {
        best = info;
      }
    }
  }
  return best;
}
