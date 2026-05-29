import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { api, getPaymentIntent, claimPayment, type PlanId } from '../lib/api';
import { transferToken } from '../lib/wallet';

type PayPhase = 'idle' | 'intent' | 'transfer' | 'claim' | 'polling' | 'done' | 'error';

const HEADLINE_PLAN: PlanId = '2weeks';
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;
const COUNT_REFRESH_MS = 5000;

// Final Era end date (verified S17 schedule: May 26 -> Jun 9, 2026). Honest, fixed
// deadline — NOT a per-visitor resetting timer.
const SEASON_END_LABEL = 'June 9';

// OWNER: set your support channel (Discord/X/Telegram URL or @handle). Shown on the
// paywall so a buyer who pays but doesn't see access has a way to reach you. Leave
// empty to hide the contact line (the on-chain self-serve recourse still shows).
const SUPPORT_HANDLE = 'fernando@waitdead.com';

const PHASE_LABEL: Record<PayPhase, string> = {
  idle: '',
  intent: 'Reading payment instructions…',
  transfer: 'Confirm the USDC transfer in your wallet…',
  claim: 'Verifying the transaction on-chain…',
  polling: 'Waiting for final block confirmation…',
  done: 'Access granted',
  error: ''
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function ValueCard({ title, benefit, pain }: { title: string; benefit: string; pain: string }) {
  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-5 text-left h-full flex flex-col">
      <h4 className="text-white font-semibold mb-1">{title}</h4>
      <p className="text-gray-300 text-sm mb-3">{benefit}</p>
      <p className="text-gray-500 text-xs mt-auto italic">{pain}</p>
    </div>
  );
}

export function PayGate() {
  const { phase: authPhase, address, isBusy, error: authError, walletInstalled, signIn, logout } = useAuth();

  const [phase, setPhase] = useState<PayPhase>('idle');
  const [payError, setPayError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState<number | null>(null);

  const { refreshAccess } = useAuth();
  const authed = authPhase === 'authenticated';
  const payBusy = phase !== 'idle' && phase !== 'error' && phase !== 'done';
  const working = isBusy || payBusy;

  // Live, count-only teaser — proves the radar is real before the user pays.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const c = await api.getActiveCount();
      if (!cancelled) setLiveCount(c);
    };
    tick();
    const id = setInterval(tick, COUNT_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const pay = async () => {
    setPayError(null);
    setTxHash(null);
    try {
      setPhase('intent');
      const intent = await getPaymentIntent(HEADLINE_PLAN);

      setPhase('transfer');
      if (!address) throw new Error('Wallet not connected');
      const hash = await transferToken({
        tokenContract: intent.tokenContract,
        to: intent.to,
        amount: intent.amount,
        from: address
      });
      setTxHash(hash);

      setPhase('claim');
      const claim = await claimPayment(hash);
      if (claim.hasAccess) {
        setPhase('done');
        await refreshAccess();
        return;
      }

      setPhase('polling');
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);
        const status = await refreshAccess();
        if (status?.hasAccess) {
          setPhase('done');
          return;
        }
      }
      throw new Error('Confirmation is taking a while. Retry the claim in a few minutes.');
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Payment error');
      setPhase('error');
    }
  };

  const retryClaim = async () => {
    if (!txHash) {
      void pay();
      return;
    }
    setPayError(null);
    try {
      setPhase('claim');
      const claim = await claimPayment(txHash);
      if (claim.hasAccess) {
        setPhase('done');
        await refreshAccess();
        return;
      }
      setPhase('polling');
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);
        const status = await refreshAccess();
        if (status?.hasAccess) {
          setPhase('done');
          return;
        }
      }
      throw new Error('Still unconfirmed. Retry in a few minutes.');
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Verification error');
      setPhase('error');
    }
  };

  // One CTA drives the whole funnel: connect+sign-in, then pay.
  const onPrimary = () => {
    if (!authed) {
      void signIn();
    } else {
      void pay();
    }
  };

  const ctaLabel = !authed
    ? 'Unlock full live access — 2 USDC / 2 weeks'
    : payBusy
      ? PHASE_LABEL[phase]
      : 'Pay 2 USDC · 2 weeks';

  const teaser =
    liveCount && liveCount > 0
      ? `${liveCount} Top-200 players active on the ladder right now — unlock to see who's climbing.`
      : 'Live ladder radar is running — unlock to watch the Top 200 move in real time.';

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200">
      {/* connected-wallet chip / switch */}
      {address && (
        <div className="absolute top-3 right-3 flex items-center gap-3">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-cyan-600/15 border border-cyan-500/30 rounded-md">
            <span className="w-2 h-2 bg-green-400 rounded-full" />
            <span className="text-cyan-300 text-xs font-mono">{shortAddress(address)}</span>
          </span>
          <button onClick={() => void logout()} className="text-gray-500 hover:text-gray-300 text-xs">
            switch
          </button>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-14 sm:py-20">
        {/* 1. HERO */}
        <section className="text-center">
          <div className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full bg-green-900/30 border border-green-600/40 text-sm">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-green-300">{teaser}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
            See who's climbing the Origins ladder — the second it happens.
          </h1>
          <p className="mt-4 text-gray-300 max-w-2xl mx-auto">
            Top 200 ranks, win/loss direction, and rank movement — refreshed about every second
            and organized so you can actually read it. Never look at a stale board again.
          </p>

          <div className="mt-8">
            <button
              onClick={onPrimary}
              disabled={working || (!authed && !walletInstalled)}
              className="inline-flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed text-gray-900 font-semibold py-3.5 px-7 rounded-lg transition-colors"
            >
              {working && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900" />}
              {ctaLabel}
            </button>
            <p className="mt-3 text-sm text-gray-400">
              Sign in with your Ronin wallet. No email, no password, no card.
            </p>
            {!authed && !walletInstalled && (
              <p className="mt-2 text-xs text-amber-300/90">
                You'll need the Ronin Wallet —{' '}
                <a href="https://wallet.roninchain.com/" target="_blank" rel="noopener noreferrer" className="underline">
                  get it here
                </a>
                .
              </p>
            )}
            {authError && <p className="mt-3 text-sm text-red-400">{authError}</p>}
          </div>
        </section>

        {/* 2. FRESHNESS GAP / PAINPOINT */}
        <section className="mt-16 bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl font-semibold text-white">The board you're using is already out of date.</h3>
          <p className="mt-3 text-gray-300">
            Most leaderboards refresh about once a minute up top — and only every 30 minutes below
            rank 1000. That's a lifetime in the Final Era. By the time a rival's surge shows up, you've
            already lost the read on who to chase and who to hold off.
          </p>
          <p className="mt-3 text-gray-400">
            One stale refresh near season-end can cost you a Top-2000 slot — and the bAXS that comes with it.
          </p>
        </section>

        {/* 3. VALUE PROPS */}
        <section className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ValueCard
            title="~1-second live radar"
            benefit="See rank moves the instant they happen, not 60 seconds late."
            pain="The board you check is already stale — by the time you see a surge, the window's gone."
          />
          <ValueCard
            title="One clean board"
            benefit="Climbing, falling, W/L streak, rank delta — at a glance. No clutter, no tab-hopping."
            pain="Digging through a cluttered leaderboard wastes the grind minutes that decide your rank."
          />
          <ValueCard
            title="Rival watchlist + alerts"
            benefit="Add rivals; get pinged the moment they come online or start moving."
            pain="You can't watch the whole Top 2000 by hand — you miss it when players above you go active."
          />
        </section>

        {/* 4. PRICE + URGENCY */}
        <section className="mt-12 bg-gradient-to-br from-cyan-950/40 to-gray-800 border border-cyan-700/50 rounded-xl p-6 text-center">
          <h3 className="text-xl font-semibold text-white">Final Era ends {SEASON_END_LABEL}. Make the last stretch count.</h3>
          <p className="mt-2 text-gray-300">
            The Top 2,000 split <span className="text-white font-semibold">80,000+ bAXS</span> this season.
            Every rank you hold right now is prize money. Your 2-week window covers the sprint to season end.
          </p>
          <div className="mt-5 inline-block text-left bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm">
            <div className="flex justify-between gap-8"><span className="text-gray-400">Access</span><span className="text-white font-medium">2 full weeks</span></div>
            <div className="flex justify-between gap-8"><span className="text-gray-400">Price</span><span className="text-white font-medium">2 USDC (~$0.14/day)</span></div>
            <div className="flex justify-between gap-8"><span className="text-gray-400">Network</span><span className="text-white font-medium">Ronin · USDC</span></div>
            <div className="flex justify-between gap-8"><span className="text-gray-400">Renewal</span><span className="text-white font-medium">None — no auto-renew</span></div>
          </div>
          <p className="mt-4 text-gray-400 text-sm">
            Less than one in-game energy refill, for the two weeks that decide your season rank. Pay on Ronin —
            the same chain you already play on.
          </p>

          {/* primary CTA (repeat) + pay progress */}
          <div className="mt-6">
            <button
              onClick={onPrimary}
              disabled={working || (!authed && !walletInstalled)}
              className="inline-flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed text-gray-900 font-semibold py-3.5 px-7 rounded-lg transition-colors"
            >
              {working && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900" />}
              {ctaLabel}
            </button>

            {phase === 'done' && (
              <div className="mt-4 text-green-400 text-sm bg-green-900/20 border border-green-800/40 rounded-md px-3 py-2">
                Payment confirmed. Loading your live radar…
              </div>
            )}
            {phase === 'error' && (
              <div className="mt-4 space-y-2">
                <div className="text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-md px-3 py-2">{payError}</div>
                {txHash && (
                  <div className="text-gray-300 text-xs bg-gray-900/50 border border-gray-700 rounded-md px-3 py-2">
                    Your 2 USDC was sent and is safe on-chain (tx below). Nothing is lost — access is
                    granted automatically once the block finalizes. Retry verification, or just reconnect
                    the same wallet in a minute.
                  </div>
                )}
                <button onClick={() => void retryClaim()} className="text-sm text-cyan-400 hover:text-cyan-300 underline">
                  {txHash ? 'Retry verification' : 'Retry payment'}
                </button>
              </div>
            )}
            {txHash && phase !== 'error' && (
              <div className="mt-3 text-xs text-gray-500 font-mono break-all">tx: {txHash}</div>
            )}
          </div>
        </section>

        {/* 5. BONUS — predictions (honest framing) */}
        <section className="mt-10">
          <h3 className="text-lg font-semibold text-white">Bonus: predicted play windows. Nobody else has this.</h3>
          <p className="mt-2 text-gray-300">
            The model learns each player's rhythm and flags when a rival is most likely to be grinding.
            It gets sharper the more sessions it sees.
          </p>
          <p className="mt-2 text-gray-500 text-sm">
            The live ladder data is real-time today. Predictions are probabilistic and improve as the system observes more play.
          </p>
        </section>

        {/* 6. TRUST / FRICTION */}
        <section className="mt-10 bg-gray-800/60 border border-gray-700 rounded-xl p-6 text-sm space-y-3">
          <p className="text-gray-300">
            <span className="text-white font-medium">What you're signing:</span> a one-time Ronin sign-in
            message to prove the wallet is yours. It's a signature, <span className="text-white">not a transaction</span> —
            it costs nothing and moves nothing.
          </p>
          <p className="text-gray-300">
            <span className="text-white font-medium">Your funds stay yours.</span> We never touch your wallet
            beyond the single <span className="text-white">2 USDC</span> payment you approve. No custody, no recurring pulls, no KYC, no email.
          </p>
          <p className="text-amber-300/80">
            Heads up: keep a little RON in your wallet for gas — the 2 USDC payment is a normal Ronin transaction with a tiny network fee.
          </p>
          <p className="text-gray-400 pt-2 border-t border-gray-700/60">
            <span className="text-white font-medium">Terms:</span> 2 USDC buys 14 days of access. All
            sales are final — no refunds.{' '}
            <span className="text-white font-medium">Paid but no access yet?</span> Your payment is
            recorded on-chain and final — keep this page open or reconnect the same wallet and access
            re-syncs within a few minutes. Your transaction hash is your proof.
            {SUPPORT_HANDLE ? <> Still stuck? Reach us at {SUPPORT_HANDLE}.</> : null}
          </p>
        </section>
      </div>
    </div>
  );
}
