import { state } from './state';
import { skyMavisService } from '../services/skyMavis';
import { LeaderboardEntry, ActivePlayer } from './types';
import { config } from '../config';

// Try to import ML session tracker, make it optional
let LocalSessionTracker: any = null;
try {
  const module = require('../ml/sessionTracker');
  LocalSessionTracker = module.LocalSessionTracker;
} catch (err) {
  console.log('⚠️ ML features disabled (SQLite not available)');
}

export class VStarScheduler {
  private leaderboardMap: Map<string, LeaderboardEntry>;
  private lastLeaderboardRefresh: number;
  private isRunning: boolean;
  private sessionTracker: any;
  private refreshCount: number = 0;
  private top200Timer: NodeJS.Timeout | null = null;
  private top300Timer: NodeJS.Timeout | null = null;

  constructor() {
    this.leaderboardMap = new Map();
    this.lastLeaderboardRefresh = 0;
    this.isRunning = false;
    
    // Only initialize session tracker if SQLite is available
    if (LocalSessionTracker) {
      try {
        this.sessionTracker = new LocalSessionTracker();
        console.log('✅ ML Session Tracker initialized');
      } catch (err) {
        console.log('⚠️ Failed to initialize ML Session Tracker:', err.message);
        this.sessionTracker = null;
      }
    } else {
      this.sessionTracker = null;
    }
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🚀 Starting VStar-based Scheduler with differentiated intervals...');
    
    // Iniciar Top 200 cada 1 segundo
    this.startTop200Timer();
    
    // Iniciar Top 300 cada 8 segundos
    this.startTop300Timer();
  }

  stop(): void {
    this.isRunning = false;
    
    // Limpiar timers
    if (this.top200Timer) {
      clearTimeout(this.top200Timer);
      this.top200Timer = null;
    }
    if (this.top300Timer) {
      clearTimeout(this.top300Timer);
      this.top300Timer = null;
    }
    
    if (this.sessionTracker) {
      this.sessionTracker.close();
    }
    console.log('⏹️ VStar Scheduler stopped');
  }

  private startTop200Timer(): void {
    if (!this.isRunning) return;
    
    const refreshTop200 = async () => {
      if (!this.isRunning) return;
      
      try {
        console.log('📊 Fetching Top 200 leaderboard...');
        const result = await skyMavisService.fetchTop200();
        const top200 = [...result.top100, ...result.top200];
        
        console.log(`✅ Fetched ${top200.length} players (Top 200)`);

        // Update refresh timestamp
        this.lastLeaderboardRefresh = Date.now();

        // Procesar solo Top 200
        await this.processLeaderboardData(top200, 'top200');
        
        // Programar siguiente refresh en 1 segundo
        this.top200Timer = setTimeout(refreshTop200, 1000);
      } catch (error) {
        console.error('❌ Error refreshing Top 200:', error.message);
        // En caso de error, esperar 2 segundos antes de reintentar
        this.top200Timer = setTimeout(refreshTop200, 2000);
      }
    };
    
    // Iniciar inmediatamente
    refreshTop200();
  }

  private startTop300Timer(): void {
    if (!this.isRunning) return;
    
    const refreshTop300 = async () => {
      if (!this.isRunning) return;
      
      try {
        console.log('📊 Fetching Top 300 leaderboard...');
        const result = await skyMavisService.fetchTop300();
        const top300 = [...result.top100, ...result.top200, ...result.top300];
        
        console.log(`✅ Fetched ${top300.length} players (Top 300)`);

        // Update refresh timestamp
        this.lastLeaderboardRefresh = Date.now();

        // Procesar todos los jugadores del Top 300 para actualizar el estado completo
        await this.processLeaderboardData(top300, 'top300');
        
        // Programar siguiente refresh en 8 segundos
        this.top300Timer = setTimeout(refreshTop300, 8000);
      } catch (error) {
        console.error('❌ Error refreshing Top 300:', error.message);
        // En caso de error, esperar 10 segundos antes de reintentar
        this.top300Timer = setTimeout(refreshTop300, 10000);
      }
    };
    
    // Iniciar inmediatamente
    refreshTop300();
  }

  private async processLeaderboardData(players: LeaderboardEntry[], source: 'top200' | 'top300'): Promise<void> {
    if (!players || players.length === 0) return;

    const now = Date.now();
    const activePlayers: ActivePlayer[] = [];

    await Promise.all(players.map(async (entry) => {
      const existing = this.leaderboardMap.get(entry.userId);
      let wasActive = false;

      // Check for VStar changes (activity detection)
      if (existing && existing.vstar !== entry.vstar) {
        const vstarChange = entry.vstar - existing.vstar;
        const won = vstarChange > 0;
        
        // Calculate rank change (positive = subió posiciones, negative = bajó posiciones)
        const lastTopRank = existing.lastTopRank ?? existing.topRank;
        const rankChange = lastTopRank - entry.topRank; // Positive rankChange = player improved (moved to lower rank number)
        
        console.log(`🎮 VStar change detected: ${entry.name} (#${entry.topRank}) ${existing.vstar} -> ${entry.vstar} (${vstarChange > 0 ? '+' : ''}${vstarChange}) Rank: ${lastTopRank} -> ${entry.topRank} (${rankChange > 0 ? '+' : ''}${rankChange})`);

        // Get Axie images asynchronously (don't block the main flow)
        let axieImages: string[] = [];

        const activePlayer: ActivePlayer = {
          userId: entry.userId,
          name: entry.name,
          rank: entry.rank,
          topRank: entry.topRank,
          vstar: entry.vstar,
          lastVstar: existing.vstar,
          lastTopRank: lastTopRank,
          rankChange: rankChange,
          battleEndedAt: now,
          endedAtLocalISO: new Date(now).toISOString(),
          endedAtEpoch: now,
          recent: true,
          axies: axieImages,
          won: won
        };

        activePlayers.push(activePlayer);
        wasActive = true;
      }

      // Update leaderboard map
      this.leaderboardMap.set(entry.userId, {
        ...entry,
        lastVstar: existing?.vstar,
        lastTopRank: existing?.topRank,
        lastSeenAt: now
      });
    }));

    // Update state with active players
    if (activePlayers.length > 0) {
      activePlayers.forEach(player => {
        state.upsertActive(player);
        // Feed the ML session tracker so sessions.db accumulates (powers the
        // "next likely play time" prediction). Each VStar change is detected once
        // (top200/top300 share leaderboardMap), so this is one call per game.
        // Non-blocking: ML must never break the live radar.
        if (this.sessionTracker) {
          try {
            this.sessionTracker.processPlayerActivity(player);
          } catch (err: any) {
            console.log('⚠️ session tracker error (non-fatal):', err?.message);
          }
        }
      });
      console.log(`🎯 Found ${activePlayers.length} active players from ${source}`);
    }

    // Solo actualizar el leaderboard completo si es Top 300 (para evitar sobrescribir)
    if (source === 'top300') {
      // Obtener todos los jugadores del leaderboard map (Top 300 completo)
      const allPlayers = Array.from(this.leaderboardMap.values())
        .sort((a, b) => a.topRank - b.topRank);
      state.updateLeaderboard(allPlayers);
    }

    // Clean up expired players
    state.pruneExpired();

    this.refreshCount++;
  }


  getStats() {
    const now = Date.now();
    const timeSinceLastRefresh = now - this.lastLeaderboardRefresh;
    const rps = this.refreshCount > 0 ? (this.refreshCount * 1000) / (now - this.lastLeaderboardRefresh) : 0;
    
    return {
      isRunning: this.isRunning,
      refreshCount: this.refreshCount,
      rps: Math.round(rps * 10) / 10,
      etaSeconds: Math.max(1 - Math.floor(timeSinceLastRefresh / 1000), 0), // Top 200 cada 1s
      playersTracked: this.leaderboardMap.size,
      lastRefresh: new Date(this.lastLeaderboardRefresh).toISOString()
    };
  }
}

export const vstarScheduler = new VStarScheduler();
