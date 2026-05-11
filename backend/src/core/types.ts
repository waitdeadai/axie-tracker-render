export interface LeaderboardEntry {
  rank: string;
  topRank: number;
  userId: string;
  name: string;
  vstar: number;
  lastVstar?: number;
  lastTopRank?: number;
  lastSeenAt: number;
  lastBattleAt?: number;
}

export interface ActivePlayer {
  userId: string;
  name: string;
  rank: string;
  topRank: number;
  vstar: number;
  lastVstar?: number;
  lastTopRank?: number;
  rankChange: number; // Positivo = subió posiciones, Negativo = bajó posiciones
  battleEndedAt: number;
  endedAtLocalISO?: string;
  endedAtEpoch?: number;
  recent: boolean;
  axies: string[];
  won: boolean;
}

export interface QueueItem {
  userId: string;
  nextPollAt: number;
  priority: 'hot' | 'cold';
}

export interface RuntimeStats {
  rps: number;
  etaSeconds: number;
  globalRemaining: number;
  hotQueueSize: number;
  coldQueueSize: number;
  activePlayersCount: number;
}