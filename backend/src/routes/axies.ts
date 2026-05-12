import { Router } from "express";
import fetch from "node-fetch";
import { load } from "cheerio";
import { getUserRankedFighters } from "../services/originsBattleLogs";
import { buildAxieCdnUrl, buildAxieUrl } from "../shared/axieImages";
import { config } from "../config";
import { getVerificationStats } from "../services/axieVerification";
import { skyMavisService } from "../services/skyMavis";
import { cache } from "../core/cache";
import { state } from "../core/state";

const SECRET = config.axieTopSecretKey;
const AXIE_TOP_BASE = config.urls.axieTop.replace(/\/+$/, "");
const AXIE_TOP_REFERER = `${AXIE_TOP_BASE}/`;
const AXIE_TOP_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
export const axiesRouter = Router();

async function fetchAxieTopMorphImages(userId: string): Promise<string[]> {
  const cached = cache.getImages(userId);
  if (cached && cached.length > 0) {
    return cached;
  }

  const response = await fetch(`${AXIE_TOP_BASE}/profile/${encodeURIComponent(userId)}/latestRankedTeam`, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      Referer: AXIE_TOP_REFERER,
      "User-Agent": AXIE_TOP_UA
    }
  });

  if (!response.ok) {
    throw new Error(`axie.top latestRankedTeam responded ${response.status}`);
  }

  const html = await response.text();
  const $ = load(html);
  const urls = $(".axie-image-container .axie-battle-image")
    .map((_, element) => $(element).attr("src") || "")
    .get()
    .filter((src) => src.startsWith("https://static.axie.top/axie/?"));

  const uniqueUrls = [...new Set(urls)];
  if (uniqueUrls.length > 0) {
    cache.setImages(userId, uniqueUrls);
  }

  return uniqueUrls;
}

function mapFightersToImageUrls(
  fighters: Array<{ axieID: number; genes?: string | null; genes_metamorph?: string | null }>,
  morphUrls: string[]
) {
  return fighters.map((fighter, index) => {
    const cdnUrl = buildAxieCdnUrl(fighter.axieID);
    const out: any = { axieID: fighter.axieID };

    out.primary = morphUrls[index] || cdnUrl;

    if (out.primary !== cdnUrl) {
      out.fallback = cdnUrl;
    } else if (fighter.genes_metamorph) {
      out.fallback = buildAxieUrl(fighter.genes_metamorph, true, SECRET);
    } else if (fighter.genes) {
      out.fallback = buildAxieUrl(fighter.genes, false, SECRET);
    }

    return out;
  });
}

// Devuelve URLs ya firmadas (metamorph prioritario + fallback normal)
axiesRouter.get("/by-user/:userId", async (req, res) => {
  try {
    console.log(`🖼️ Requesting axies for user: ${req.params.userId}`);
    
    const fighters = await getUserRankedFighters(req.params.userId);
    const morphUrls = await fetchAxieTopMorphImages(req.params.userId).catch((error) => {
      console.warn(`⚠️ Could not scrape axie.top morph images for ${req.params.userId}:`, error);
      return [];
    });
    console.log(`🖼️ Got ${fighters.length} fighters for user: ${req.params.userId}`);
    const list = mapFightersToImageUrls(fighters, morphUrls);
    
    console.log(`🖼️ Built ${list.length} axie URLs for user: ${req.params.userId}`);
    
    // Cache HTTP (el CDN/navegador ayuda mucho)
    res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.json({ fighters: list });
  } catch (e:any) {
    console.error(`❌ Error getting axies for user ${req.params.userId}:`, e);
    res.status(500).json({ error: e?.message || "axies" });
  }
});

// Endpoint de estadísticas de verificación
axiesRouter.get("/verification-stats", (req, res) => {
  try {
    const stats = getVerificationStats();
    res.json({
      verification: stats,
      timestamp: new Date().toISOString(),
      interval: "1 hour"
    });
  } catch (e:any) {
    res.status(500).json({ error: e?.message || "stats" });
  }
});

// Endpoint de debug para verificar configuración
axiesRouter.get("/debug", (req, res) => {
  try {
    res.json({
      blogEndpoint: config.blogEndpoint,
      blogKeys: config.blogKeys.length,
      secretKey: config.axieTopSecretKey ? "CONFIGURADO" : "NO CONFIGURADO",
      apiKeyHeader: config.apiKeyHeader,
      timestamp: new Date().toISOString()
    });
  } catch (e:any) {
    res.status(500).json({ error: e?.message || "debug" });
  }
});

// Endpoint de prueba simple
axiesRouter.get("/test", (req, res) => {
  try {
    const testGenes = "0x2000000000000300008100e08308000000010001088081000001000010a043020000009008004600000000000000000000";
    const url = buildAxieUrl(testGenes, false, SECRET);
    res.json({
      testUrl: url,
      timestamp: new Date().toISOString()
    });
  } catch (e:any) {
    res.status(500).json({ error: e?.message || "test" });
  }
});

// Endpoint para diagnosticar un usuario específico
axiesRouter.get("/diagnose/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`🔬 Diagnosing user: ${userId}`);
    
    // Verificar cache
    const userCache = (global as any).USER_CACHE?.get?.(userId);
    const axieCache = (global as any).AXIE_CACHE;
    
    // Intentar obtener datos frescos
    const fighters = await getUserRankedFighters(userId);
    
    res.json({
      userId,
      cache: {
        user: userCache ? { hasCache: true, age: Date.now() - userCache.ts } : { hasCache: false },
        axies: axieCache ? Array.from(axieCache.keys()).length : 0
      },
      fighters: fighters.map(f => ({
        axieID: f.axieID,
        hasGenes: !!f.genes,
        hasMetamorph: !!f.genes_metamorph
      })),
      timestamp: new Date().toISOString()
    });
  } catch (e:any) {
    res.status(500).json({ 
      error: e?.message || "diagnosis failed",
      userId: req.params.userId,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint combinado para obtener axies e información del último oponente
axiesRouter.get("/user-data/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`🔄 Requesting combined user data for: ${userId}`);
    
    // Obtener battle logs UNA SOLA VEZ usando getUserRankedFighters
    const fighters = await getUserRankedFighters(userId);
    const morphUrls = await fetchAxieTopMorphImages(userId).catch((error) => {
      console.warn(`⚠️ Could not scrape axie.top morph images for ${userId}:`, error);
      return [];
    });
    const axiesList = mapFightersToImageUrls(fighters, morphUrls);
    
    // Extraer información del último oponente de los mismos battle logs
    let lastOpponent = null;
    try {
      // Usar el mismo cache de battle logs que getUserRankedFighters
      const u = (global as any).USER_CACHE?.get?.(userId);
      if (u && u.battleLogs) {
        // Si tenemos battle logs en cache, usarlos
        const rankedLogs = u.battleLogs.filter((log: any) => 
          log?.gameData?.gameMode === 'ranked'
        );
        
        if (rankedLogs.length > 0) {
          const latestLog = rankedLogs.reduce((latest: any, current: any) => 
            current.gameData.endedAt > latest.gameData.endedAt ? current : latest
          );
          
          const rivalId = skyMavisService.getRivalFromLog(latestLog, userId);
          if (rivalId) {
            const rival = latestLog.gameData.players.find((p: any) => p.userID === rivalId);
                         if (rival) {
               // Buscar el nombre real del jugador en el leaderboard del estado
               const leaderboard = state.getAllPlayers();
               let playerName = rival.team?.name || rival.name || "Unknown Player"; // Fallback al nombre del equipo
               
               console.log(`🔍 Buscando rival ${rivalId} (rank #${rival.topRank}) en leaderboard (${leaderboard?.length || 0} jugadores)`);
               
               if (leaderboard) {
                 // Buscar por userId exacto
                 let playerInLeaderboard = leaderboard.find(p => p.userId === rivalId);
                 
                 // Si no encuentra, buscar por userId sin mayúsculas/minúsculas
                 if (!playerInLeaderboard) {
                   playerInLeaderboard = leaderboard.find(p => p.userId.toLowerCase() === rivalId.toLowerCase());
                 }
                 
                 // Si aún no encuentra, buscar por userId que contenga el rivalId
                 if (!playerInLeaderboard) {
                   playerInLeaderboard = leaderboard.find(p => p.userId.includes(rivalId) || rivalId.includes(p.userId));
                 }
                 
                 if (playerInLeaderboard) {
                   playerName = playerInLeaderboard.name;
                   console.log(`✅ Encontrado en leaderboard: ${playerName} (userId: ${playerInLeaderboard.userId})`);
                 } else {
                   console.log(`❌ No encontrado en leaderboard, usando: ${playerName}`);
                   console.log(`🔍 Primeros 5 userIds del leaderboard:`, leaderboard.slice(0, 5).map(p => p.userId));
                 }
               }
              
              // Verificar si el rival está en el top 200
              const isTop200 = rival.topRank <= 200;
              
              lastOpponent = {
                userId: rival.userID,
                name: playerName, // Nombre real del jugador
                vstar: rival.vstar,
                topRank: rival.topRank,
                isTop200,
                battleEndedAt: latestLog.gameData.endedAt,
                teamName: rival.team?.name || "Unknown Team"
              };
              
              console.log(`🥊 Found last opponent: ${lastOpponent.name} (Rank #${lastOpponent.topRank})`);
            }
          }
        }
      } else {
        // Si no hay cache, hacer una consulta separada (fallback)
        const battleLog = await skyMavisService.fetchLatestRankedLog(userId);
        if (battleLog) {
          const rivalId = skyMavisService.getRivalFromLog(battleLog, userId);
          if (rivalId) {
            const rival = battleLog.gameData.players.find(p => p.userID === rivalId);
                         if (rival) {
               // Buscar el nombre real del jugador en el leaderboard del estado
               const leaderboard = state.getAllPlayers();
               let playerName = rival.team?.name || rival.name || "Unknown Player"; // Fallback al nombre del equipo
               
               if (leaderboard) {
                 // Buscar por userId exacto
                 let playerInLeaderboard = leaderboard.find(p => p.userId === rivalId);
                 
                 // Si no encuentra, buscar por userId sin mayúsculas/minúsculas
                 if (!playerInLeaderboard) {
                   playerInLeaderboard = leaderboard.find(p => p.userId.toLowerCase() === rivalId.toLowerCase());
                 }
                 
                 // Si aún no encuentra, buscar por userId que contenga el rivalId
                 if (!playerInLeaderboard) {
                   playerInLeaderboard = leaderboard.find(p => p.userId.includes(rivalId) || rivalId.includes(p.userId));
                 }
                 
                 if (playerInLeaderboard) {
                   playerName = playerInLeaderboard.name;
                   console.log(`✅ Encontrado en leaderboard (fallback): ${playerName} (userId: ${playerInLeaderboard.userId})`);
                 } else {
                   console.log(`❌ No encontrado en leaderboard (fallback), usando: ${playerName}`);
                 }
               }
              
              // Verificar si el rival está en el top 200
              const isTop200 = rival.topRank <= 200;
              
              lastOpponent = {
                userId: rival.userID,
                name: playerName, // Nombre real del jugador
                vstar: rival.vstar,
                topRank: rival.topRank,
                isTop200,
                battleEndedAt: battleLog.gameData.endedAt,
                teamName: rival.team?.name || "Unknown Team"
              };
              
              console.log(`🥊 Found last opponent: ${lastOpponent.name} (Rank #${lastOpponent.topRank})`);
            }
          }
        }
      }
    } catch (opponentError) {
      console.warn(`⚠️ Could not fetch last opponent for ${userId}:`, opponentError);
      // No fallamos toda la request si falla el oponente
    }
    
    const response = {
      fighters: axiesList,
      lastOpponent
    };
    
    console.log(`✅ Combined data for ${userId}: ${axiesList.length} fighters, ${lastOpponent ? 'with' : 'without'} opponent`);
    
    // Cache HTTP
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=1800");
    res.json(response);
  } catch (e:any) {
    console.error(`❌ Error getting combined user data for ${req.params.userId}:`, e);
    res.status(500).json({ error: e?.message || "user-data" });
  }
});
