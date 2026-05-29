import { useAuth } from './AuthProvider';
import { useWatchlist } from '../hooks/useWatchlist';

// The paid hero: a live panel of your pinned rivals with "grinding now" status,
// driven by the 1-second VStar radar (backend core/state). Gated on the watchlist
// add-on entitlement (watchlistAccess), not base access — so the poller never
// runs (and never 402-spams) for a wallet that isn't entitled.
export function RivalRadar() {
  const { watchlistAccess, watchlistFree } = useAuth();
  // Only poll when entitled — keeps /watchlist quiet for non-entitled wallets.
  const { rivals, toggle, alertsEnabled, enableAlerts } = useWatchlist({
    poll: true,
    enabled: watchlistAccess
  });
  if (!watchlistAccess) return null;

  const onlineCount = rivals.filter((r) => r.online).length;

  return (
    <section className="mb-6 rounded-lg border border-cyan-700 bg-gray-800 p-4">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-white">
          Rival Radar <span className="text-cyan-400">({onlineCount} grinding now)</span>
          {watchlistFree && (
            <span
              className="ml-2 align-middle text-[10px] uppercase tracking-wide rounded-full border border-amber-500/50 bg-amber-900/30 text-amber-300 px-2 py-0.5"
              title="Included free for launch pass holders — becomes a paid Premium add-on after launch."
            >
              Founder · included free
            </span>
          )}
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => enableAlerts()}
            disabled={alertsEnabled}
            className={`text-xs rounded px-2 py-1 border ${
              alertsEnabled
                ? 'border-green-600 text-green-400 cursor-default'
                : 'border-cyan-600 text-cyan-300 hover:bg-cyan-900/30'
            }`}
            title="Get a browser notification when a pinned rival queues up"
          >
            {alertsEnabled ? 'Alerts on' : 'Enable alerts'}
          </button>
          <span className="text-xs text-gray-400">{rivals.length} pinned</span>
        </div>
      </div>

      {rivals.length === 0 ? (
        <p className="text-sm text-gray-400">
          Pin rivals from the cards below to track when they queue up. You push when
          they're offline and brace when they're grinding.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {rivals.map((r) => (
            <li
              key={r.playerUserId}
              className={`flex items-center justify-between rounded px-3 py-2 border ${
                r.online ? 'bg-green-900/40 border-green-600' : 'bg-gray-900 border-gray-700'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${
                      r.online ? 'bg-green-400 animate-pulse' : 'bg-gray-600'
                    }`}
                  />
                  <span className="text-white truncate" title={r.playerName}>
                    {r.playerName || r.playerUserId}
                  </span>
                </div>
                <div className="text-xs text-gray-400 ml-4">
                  {r.topRank ? `#${r.topRank}` : '—'}
                  {r.vstar != null ? ` · ${r.vstar}★` : ''}
                  {r.online ? ' · grinding now' : ' · offline'}
                </div>
              </div>
              <button
                onClick={() => toggle(r.playerUserId, r.playerName)}
                className="ml-2 flex-shrink-0 text-gray-500 hover:text-red-400"
                title="Unpin rival"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
