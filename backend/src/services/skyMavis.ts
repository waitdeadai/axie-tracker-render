import { z } from 'zod';
import { config } from '../config';
import { rateLimiter } from '../core/limiter';
import { cache } from '../core/cache';
import { LeaderboardEntry } from '../core/types';

const LeaderboardItemSchema = z.object({
  userID: z.string(),
  name: z.string(),
  rank: z.string(),
  tier: z.number(),
  topRank: z.number(),
  vstar: z.number(),
  avatar: z.string().nullable(),
  _etag: z.string().nullable()
});

const LeaderboardResponseSchema = z.object({
  _etag: z.string().nullable(),
  _items: z.array(LeaderboardItemSchema)
});

const BattleLogItemSchema = z.object({
  gameData: z.object({
    endedAt: z.number(),
    gameMode: z.string(),
    winner: z.union([z.string(), z.number()]).optional(),
    loser: z.union([z.string(), z.number()]).optional(),
    winnerTeam: z.array(z.string()).optional(),
    loserTeam: z.array(z.string()).optional(),
    players: z.array(z.object({
      userID: z.string(),
      name: z.string(),
      vstar: z.number(),
      topRank: z.number(),
      avatar: z.string().nullable(),
      team: z.object({
        name: z.string()
      }).optional()
    }))
  })
});

const BattleLogResponseSchema = z.object({
  _items: z.array(BattleLogItemSchema)
});

export class SkyMavisService {
  // Método para compatibilidad con scheduler antiguo
  async fetchTop100(): Promise<LeaderboardEntry[]> {
    const result = await this.fetchTop200();
    return result.top100;
  }

  async fetchTop200(): Promise<{ top100: LeaderboardEntry[], top200: LeaderboardEntry[] }> {
    try {
      // Hacer las dos consultas en paralelo con timeouts reducidos
      const [top100Response, top200Response] = await Promise.all([
        rateLimiter.scheduleFetch({
          url: `${config.urls.leaderboard}?limit=100&offset=0`,
        }),
        rateLimiter.scheduleFetch({
          url: `${config.urls.leaderboard}?limit=100&offset=100`,
        })
      ]);
      
      if (!top100Response.ok || !top200Response.ok) {
        throw new Error(`Failed to fetch leaderboard: ${top100Response.status}/${top200Response.status}`);
      }

      // Procesar respuestas en paralelo
      const [top100Data, top200Data] = await Promise.all([
        top100Response.json(),
        top200Response.json()
      ]);
      
      const [validatedTop100, validatedTop200] = await Promise.all([
        LeaderboardResponseSchema.parse(top100Data),
        LeaderboardResponseSchema.parse(top200Data)
      ]);

      // Log para investigar los datos crudos
      console.log('🔍 Raw API Data Sample:');
      console.log('Top 100 first item:', validatedTop100._items[0]);
      console.log('Top 200 first item:', validatedTop200._items[0]);

      const now = Date.now();

      // Transformar las respuestas en paralelo
      const [top100, top101to200] = await Promise.all([
        Promise.all(validatedTop100._items.map(item => ({
          rank: item.rank,
          topRank: item.topRank,
          userId: item.userID,
          name: item.name,
          vstar: item.vstar,
          lastVstar: item.vstar,
          lastSeenAt: now
        }))),
        Promise.all(validatedTop200._items.map(item => ({
          rank: item.rank,
          topRank: item.topRank, // Ya no sumamos 100 porque la API ya nos da el rank correcto
          userId: item.userID,
          name: item.name,
          vstar: item.vstar,
          lastVstar: item.vstar,
          lastSeenAt: now
        })))
      ]);

      const result = {
        top100,
        top200: top101to200  // Solo los jugadores 101-200, sin duplicar
      };

      return result;
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      throw error;
    }
  }

  async fetchTop300(): Promise<{ top100: LeaderboardEntry[], top200: LeaderboardEntry[], top300: LeaderboardEntry[] }> {
    try {
      // Hacer las tres consultas en paralelo con timeouts reducidos
      const [top100Response, top200Response, top300Response] = await Promise.all([
        rateLimiter.scheduleFetch({
          url: `${config.urls.leaderboard}?limit=100&offset=0`,
        }),
        rateLimiter.scheduleFetch({
          url: `${config.urls.leaderboard}?limit=100&offset=100`,
        }),
        rateLimiter.scheduleFetch({
          url: `${config.urls.leaderboard}?limit=100&offset=200`,
        })
      ]);
      
      if (!top100Response.ok || !top200Response.ok || !top300Response.ok) {
        throw new Error(`Failed to fetch leaderboard: ${top100Response.status}/${top200Response.status}/${top300Response.status}`);
      }

      // Procesar respuestas en paralelo
      const [top100Data, top200Data, top300Data] = await Promise.all([
        top100Response.json(),
        top200Response.json(),
        top300Response.json()
      ]);
      
      const [validatedTop100, validatedTop200, validatedTop300] = await Promise.all([
        LeaderboardResponseSchema.parse(top100Data),
        LeaderboardResponseSchema.parse(top200Data),
        LeaderboardResponseSchema.parse(top300Data)
      ]);

      // Log para investigar los datos crudos
      console.log('🔍 Raw API Data Sample (Top 300):');
      console.log('Top 100 first item:', validatedTop100._items[0]);
      console.log('Top 200 first item:', validatedTop200._items[0]);
      console.log('Top 300 first item:', validatedTop300._items[0]);

      const now = Date.now();

      // Transformar las respuestas en paralelo
      const [top100, top101to200, top201to300] = await Promise.all([
        Promise.all(validatedTop100._items.map(item => ({
          rank: item.rank,
          topRank: item.topRank,
          userId: item.userID,
          name: item.name,
          vstar: item.vstar,
          lastVstar: item.vstar,
          lastSeenAt: now
        }))),
        Promise.all(validatedTop200._items.map(item => ({
          rank: item.rank,
          topRank: item.topRank,
          userId: item.userID,
          name: item.name,
          vstar: item.vstar,
          lastVstar: item.vstar,
          lastSeenAt: now
        }))),
        Promise.all(validatedTop300._items.map(item => ({
          rank: item.rank,
          topRank: item.topRank,
          userId: item.userID,
          name: item.name,
          vstar: item.vstar,
          lastVstar: item.vstar,
          lastSeenAt: now
        })))
      ]);

      const result = {
        top100,
        top200: top101to200,  // Solo los jugadores 101-200, sin duplicar
        top300: top201to300   // Solo los jugadores 201-300, sin duplicar
      };

      return result;
    } catch (error) {
      console.error('Error fetching top 300 leaderboard:', error);
      throw error;
    }
  }

  async fetchLatestRankedLog(userId: string): Promise<z.infer<typeof BattleLogItemSchema> | null> {
    try {
      const cached = cache.getBattleLog(userId);
      if (cached) {
        return cached;
      }

      // Usar el mismo endpoint que getUserRankedFighters
      const response = await rateLimiter.scheduleFetch({
        url: `${config.blogEndpoint}/community/users/${encodeURIComponent(userId)}/battle-logs?limit=10`,
        init: {
          headers: {
            [config.apiKeyHeader]: config.blogKeys[0] || config.apiKeys[0]
          }
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch battle log: ${response.status}`);
      }

      const data = await response.json();
      const items = Array.isArray(data) ? data : (data?._items || []);
      
      if (items.length === 0) {
        return null;
      }

      // Filtrar solo battle logs ranked
      const rankedLogs = items.filter(log => 
        log?.gameData?.gameMode === 'ranked'
      );

      if (rankedLogs.length === 0) {
        return null;
      }

      // Obtener el más reciente
      const latestLog = rankedLogs.reduce((latest, current) => 
        current.gameData.endedAt > latest.gameData.endedAt ? current : latest
      );

      cache.setBattleLog(userId, latestLog);
      return latestLog;
    } catch (error) {
      console.error(`Error fetching battle log for ${userId}:`, error);
      return null;
    }
  }

  // Obtener rival de un battle log
  getRivalFromLog(log: z.infer<typeof BattleLogItemSchema>, playerUserId: string): string | null {
    const rival = log.gameData.players.find(p => p.userID !== playerUserId);
    return rival?.userID || null;
  }
}

export const skyMavisService = new SkyMavisService();