import fetch from "node-fetch";
import { MultiKeyLimiter } from "../core/multiKeyLimiter";
import { pickRankedFighters } from "../shared/axieImages";
import { config } from "../config";

const ENDPOINT = config.blogEndpoint;
const BLOG_KEYS = config.blogKeys;
const limiter = new MultiKeyLimiter(BLOG_KEYS.slice(0, Math.min(3, BLOG_KEYS.length)), 5, 100);

// Gated debug logging: this file emitted ~a dozen console.log lines per
// battle-logs fetch and fed the docker json-log firehose. Off unless
// AXIE_DEBUG_LOGS=1.
const dlog = (...args: unknown[]): void => {
  if (process.env.AXIE_DEBUG_LOGS === '1') globalThis.console.log(...args);
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Caches en memoria
type GenesInfo = { genes: string|null; genes_metamorph: string|null; ts: number };
const AXIE_CACHE = new Map<number, GenesInfo>(); // axieID -> genes (TTL largo, cambian poco)
const USER_CACHE = new Map<string, { axies: number[]; battleLogs?: any[]; ts: number }>(); // userId -> axies del último ranked

// Hacer caches accesibles globalmente para diagnóstico
(global as any).AXIE_CACHE = AXIE_CACHE;
(global as any).USER_CACHE = USER_CACHE;

const TTL_AXIE_MS = 60 * 60 * 1000;          // 1 hora
const TTL_USER_MS = 7 * 60 * 1000;          // 7 min

function fresh(ts:number, ttl:number){ return (Date.now() - ts) < ttl; }

// Build a result from whatever we still hold cached for a user, ignoring TTL.
// Used as graceful degradation when the upstream is unavailable so a player's
// card keeps its last-known axies instead of vanishing.
function staleFromCache(userId: string): any[] {
  const u = USER_CACHE.get(userId);
  if (!u) return [];
  const out: any[] = [];
  for (const id of u.axies) {
    const gi = AXIE_CACHE.get(id);
    if (gi) out.push({ axieID: id, genes: gi.genes, genes_metamorph: gi.genes_metamorph });
  }
  return out;
}

export async function getUserRankedFighters(userId: string) {
  dlog(`🔍 Getting ranked fighters for user: ${userId}`);

  const u = USER_CACHE.get(userId);
  if (u && fresh(u.ts, TTL_USER_MS)) {
    dlog(`✅ Using cached user data for: ${userId}`);
    const out: any[] = [];
    for (const id of u.axies) {
      const gi = AXIE_CACHE.get(id);
      if (gi && fresh(gi.ts, TTL_AXIE_MS)) out.push({ axieID: id, genes: gi.genes, genes_metamorph: gi.genes_metamorph });
    }
    if (out.length) return out;
  }

  dlog(`🌐 Fetching battle-logs from API for user: ${userId}`);

  // Throttle every battle-logs request through the shared token-bucket limiter
  // (5 req/s + 100 req/min PER KEY). Previously this loop called fetch() directly
  // and bypassed the limiter entirely, so bursts of per-player lookups hammered
  // the upstream and triggered the 429s that cut the live feed. nextKey() blocks
  // until a token frees and rotates across keys, so the request rate stays under
  // the upstream quota.
  const maxAttempts = Math.max(2, Math.min(3, BLOG_KEYS.length || 1));
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let key: string;
    try {
      key = await limiter.nextKey();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      break;
    }

    try {
      const url = `${ENDPOINT}/community/users/${encodeURIComponent(userId)}/battle-logs?limit=10`;
      const r = await fetch(url, {
        headers: { [config.apiKeyHeader]: key, 'Content-Type': 'application/json' },
      });

      if (!r.ok) {
        lastError = new Error(`Battle-logs API error: ${r.status} ${r.statusText}`);
        if (r.status === 429) {
          const retryAfter = r.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(8000, 500 * 2 ** attempt);
          dlog(`⏳ Rate limited, backing off ${delay}ms`);
          await sleep(delay);
          continue;
        }
        if (r.status >= 500) {
          await sleep(Math.min(8000, 500 * 2 ** attempt));
          continue;
        }
        break; // other 4xx: don't hammer — fall through to cache
      }

      const data = await r.json();
      const items = Array.isArray(data) ? data : ((data as any)?._items || []);
      const fighters = pickRankedFighters(items, userId);

      const axIds: number[] = [];
      for (const f of fighters) {
        if (!f.axieID) continue;
        axIds.push(f.axieID);
        AXIE_CACHE.set(f.axieID, { genes: f.genes, genes_metamorph: f.genes_metamorph, ts: Date.now() });
      }
      USER_CACHE.set(userId, { axies: axIds, battleLogs: items, ts: Date.now() });
      dlog(`✅ Cached ${axIds.length} axies for user: ${userId}`);
      return fighters;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await sleep(Math.min(8000, 500 * 2 ** attempt));
    }
  }

  // Graceful degradation: NEVER throw (the live feed must not cut). Serve stale
  // cache when we have it; otherwise an empty list. The image routes and
  // verifyPlayerGenes already treat an empty result as "nothing to update".
  const stale = staleFromCache(userId);
  if (stale.length) {
    dlog(`⚠️ Serving stale cache for ${userId}: ${lastError?.message ?? 'fetch failed'}`);
  } else {
    console.error(`❌ Battle-logs unavailable for ${userId}: ${lastError?.message ?? 'unknown'}`);
  }
  return stale;
}
