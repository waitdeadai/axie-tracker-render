import { LRUCache } from 'lru-cache';
import { config } from '../config';
import { LeaderboardEntry } from './types';
import { z } from 'zod';

const BattleLogItemSchema = z.object({
  gameData: z.object({
    endedAt: z.number(),
    winner: z.string(),
    loser: z.string(),
    winnerTeam: z.array(z.string()),
    loserTeam: z.array(z.string())
  })
});

type BattleLogItem = z.infer<typeof BattleLogItemSchema>;

class Cache {
  private battleLogCache: LRUCache<string, BattleLogItem>;
  private imageCache: LRUCache<string, string[]>;
  private leaderboardCache: LRUCache<string, LeaderboardEntry[]>;

  constructor() {
    this.battleLogCache = new LRUCache({
      max: 500,
      ttl: 15000 // 15 segundos
    });

    this.imageCache = new LRUCache({
      max: 200,
      ttl: config.windows.imagesTtl
    });

    this.leaderboardCache = new LRUCache({
      max: 1,
      ttl: config.windows.refresh
    });
  }

  // Battle Log
  getBattleLog(userId: string): BattleLogItem | undefined {
    return this.battleLogCache.get(userId);
  }

  setBattleLog(userId: string, log: BattleLogItem): void {
    this.battleLogCache.set(userId, log);
  }

  // Images
  getImages(userId: string): string[] | undefined {
    return this.imageCache.get(userId);
  }

  setImages(userId: string, images: string[]): void {
    this.imageCache.set(userId, images);
  }

  // Leaderboard
  getLeaderboard(): LeaderboardEntry[] | undefined {
    return this.leaderboardCache.get('leaderboard');
  }

  setLeaderboard(entries: LeaderboardEntry[]): void {
    this.leaderboardCache.set('leaderboard', entries);
  }
}

export const cache = new Cache();