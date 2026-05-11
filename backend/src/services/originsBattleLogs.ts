import fetch from "node-fetch";
import { MultiKeyLimiter } from "../core/multiKeyLimiter";
import { pickRankedFighters } from "../shared/axieImages";
import { config } from "../config";

const ENDPOINT = config.blogEndpoint;
const BLOG_KEYS = config.blogKeys;
const limiter = new MultiKeyLimiter(BLOG_KEYS.slice(0, Math.min(3, BLOG_KEYS.length)), 5, 100);

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

export async function getUserRankedFighters(userId: string) {
  console.log(`🔍 Getting ranked fighters for user: ${userId}`);
  
  const u = USER_CACHE.get(userId);
  if (u && fresh(u.ts, TTL_USER_MS)) {
    console.log(`✅ Using cached user data for: ${userId}`);
    const out:any[] = [];
    for (const id of u.axies) {
      const gi = AXIE_CACHE.get(id);
      if (gi && fresh(gi.ts, TTL_AXIE_MS)) out.push({ axieID:id, genes:gi.genes, genes_metamorph:gi.genes_metamorph });
    }
    if (out.length) return out;
  }

  console.log(`🌐 Fetching battle-logs from API for user: ${userId}`);
  
  // Sistema de retry con cambio de key
  const maxRetries = 3;
  const maxKeys = BLOG_KEYS.length;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    for (let keyIndex = 0; keyIndex < maxKeys; keyIndex++) {
      try {
        const key = BLOG_KEYS[keyIndex];
        const url = `${ENDPOINT}/community/users/${encodeURIComponent(userId)}/battle-logs?limit=10`;
        
        console.log(`🌐 Attempt ${attempt + 1}, Key ${keyIndex + 1}/${maxKeys}: ${url}`);
        console.log(`🔑 Using key: ${key.substring(0, 8)}...`);
        
        const r = await fetch(url, {
          headers: { 
            [config.apiKeyHeader]: key,
            'Content-Type': 'application/json'
          }
        });
        
        console.log(`🌐 Response status: ${r.status}`);
        
        if (!r.ok) {
          const errorMsg = `Battle-logs API error: ${r.status} ${r.statusText}`;
          console.error(`❌ ${errorMsg}`);
          lastError = new Error(errorMsg);
          
          // Si es 429, esperar antes de continuar
          if (r.status === 429) {
            const retryAfter = r.headers.get('Retry-After');
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
            console.log(`⏳ Rate limited, waiting ${delay}ms before next attempt`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          continue; // Probar siguiente key
        }
        
        const data = await r.json();
        console.log(`🌐 Response data type: ${typeof data}, isArray: ${Array.isArray(data)}`);
        
        const items = Array.isArray(data)? data : (data?._items || []);
        console.log(`🌐 Found ${items.length} battle-logs`);
        
        const fighters = pickRankedFighters(items, userId);
        console.log(`🌐 Found ${fighters.length} ranked fighters`);

        const axIds:number[] = [];
        for (const f of fighters) {
          if (!f.axieID) continue;
          axIds.push(f.axieID);
          AXIE_CACHE.set(f.axieID, { genes: f.genes, genes_metamorph: f.genes_metamorph, ts: Date.now() });
        }
        USER_CACHE.set(userId, { axies: axIds, battleLogs: items, ts: Date.now() });
        
        console.log(`✅ Cached ${axIds.length} axies for user: ${userId}`);
        return fighters;
        
      } catch (error) {
        console.error(`❌ Error with key ${keyIndex + 1}:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Backoff exponencial entre intentos
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          console.log(`⏳ Backoff delay: ${delay}ms before next attempt`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }
  
  // Si llegamos aquí, todos los intentos fallaron
  console.error(`❌ All ${maxRetries * maxKeys} attempts failed for user: ${userId}`);
  throw lastError || new Error(`Failed to fetch battle-logs for ${userId} after ${maxRetries * maxKeys} attempts`);
}
