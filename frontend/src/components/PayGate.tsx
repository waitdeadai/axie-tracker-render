import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { getPaymentIntent, claimPayment, type PlanId } from '../lib/api';
import { transferToken } from '../lib/wallet';

type PayPhase = 'idle' | 'intent' | 'transfer' | 'claim' | 'polling' | 'done' | 'error';

const HEADLINE_PLAN: PlanId = '2weeks';
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

const PHASE_LABEL: Record<PayPhase, string> = {
  idle: '',
  intent: 'Leyendo instrucciones de pago…',
  transfer: 'Confirma la transferencia de USDC en tu wallet…',
  claim: 'Verificando la transacción on-chain…',
  polling: 'Esperando confirmación final del bloque…',
  done: 'Acceso concedido',
  error: ''
};

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function PayGate() {
  const { address, refreshAccess, logout } = useAuth();
  const [phase, setPhase] = useState<PayPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const busy = phase !== 'idle' && phase !== 'error' && phase !== 'done';

  const pay = async () => {
    setError(null);
    setTxHash(null);
    try {
      setPhase('intent');
      const intent = await getPaymentIntent(HEADLINE_PLAN);

      setPhase('transfer');
      if (!address) {
        throw new Error('Wallet no conectada');
      }
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

      // Claim accepted but block not yet final — poll access status.
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
      throw new Error('La confirmación está tardando. Reintenta el reclamo en unos minutos.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error en el pago');
      setPhase('error');
    }
  };

  const retryClaim = async () => {
    if (!txHash) {
      void pay();
      return;
    }
    setError(null);
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
      throw new Error('Aún sin confirmar. Reintenta en unos minutos.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al verificar');
      setPhase('error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-8">
        <div className="text-center">
          <div className="text-blue-500 text-5xl mb-4">🔓</div>
          <h2 className="text-2xl font-bold text-white mb-2">Activa tu acceso</h2>
          <p className="text-gray-300 mb-6">
            Paga <span className="font-semibold text-white">2 USDC</span> para{' '}
            <span className="font-semibold text-white">2 semanas</span> de acceso al tracker.
          </p>

          {address && (
            <div className="mb-6 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600/15 border border-blue-500/30 rounded-md">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-blue-300 text-sm font-mono">{shortAddress(address)}</span>
            </div>
          )}

          <div className="bg-gray-900/60 border border-gray-700 rounded-md p-4 mb-6 text-left text-sm text-gray-300 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-400">Plan</span>
              <span className="font-medium text-white">2 semanas</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Precio</span>
              <span className="font-medium text-white">2 USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Red</span>
              <span className="font-medium text-white">Ronin (2020)</span>
            </div>
          </div>

          {phase === 'done' ? (
            <div className="text-green-400 text-sm bg-green-900/20 border border-green-800/40 rounded-md px-3 py-2 mb-4">
              Pago confirmado. Cargando el tracker…
            </div>
          ) : (
            <button
              onClick={() => void pay()}
              disabled={busy}
              className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-md w-full transition-colors"
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  {PHASE_LABEL[phase]}
                </span>
              ) : (
                'Pagar 2 USDC · 2 semanas'
              )}
            </button>
          )}

          {phase === 'error' && (
            <div className="mt-4 space-y-3">
              <div className="text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-md px-3 py-2">
                {error}
              </div>
              <button
                onClick={() => void retryClaim()}
                className="text-sm text-blue-400 hover:text-blue-300 underline"
              >
                {txHash ? 'Reintentar verificación' : 'Reintentar pago'}
              </button>
            </div>
          )}

          {txHash && phase !== 'error' && (
            <div className="mt-4 text-xs text-gray-500 font-mono break-all">tx: {txHash}</div>
          )}

          <div className="mt-6 text-amber-300/80 text-xs bg-amber-900/10 border border-amber-800/30 rounded-md px-3 py-2">
            ⛽ Necesitas un poco de RON en tu wallet para pagar el gas de la transferencia.
          </div>

          <button
            onClick={() => void logout()}
            className="mt-6 text-gray-400 hover:text-gray-200 text-sm transition-colors"
          >
            Cambiar de wallet
          </button>
        </div>
      </div>
    </div>
  );
}
