import { PriorityQueue } from './priorityQueue';
import { state } from './state';
import { rateLimiter } from './limiter';
import { skyMavisService } from '../services/skyMavis';
import { config } from '../env';
import { LeaderboardEntry, ActivePlayer, QueueItem, RuntimeStats } from './types';

export class Scheduler {
  private priorityQueue = new PriorityQueue();
  private isRunning = false;
  private leaderboardMap = new Map<string, LeaderboardEntry>();
  private lastLeaderboardRefresh = 0;
  private processedInTick = new Set<string>();
  private movingAvgRPS = 0;
  private requestCount = 0;
  private lastMetricsUpdate = Date.now();
  private topRange: 'top200' | 'top300' = 'top200';

  // Inicializar el scheduler
  async initialize(): Promise<void> {
    console.log('Initializing scheduler...');
    
    try {
      // Obtener Top 100 inicial
      const leaderboard = await skyMavisService.fetchTop100();
      this.updateLeaderboard(leaderboard);
      
      // Llenar colas iniciales
      this.populateQueues();
      
      console.log(`Scheduler initialized with ${leaderboard.length} players`);
    } catch (error) {
      console.error('Failed to initialize scheduler:', error);
      throw error;
    }
  }

  // Cambiar el rango de jugadores a monitorear
  async setTopRange(range: 'top200' | 'top300'): Promise<void> {
    if (this.topRange === range) return;
    
    console.log(`🔄 Switching from ${this.topRange} to ${range}`);
    this.topRange = range;
    
    // Limpiar colas actuales
    this.priorityQueue.clear();
    this.leaderboardMap.clear();
    
    try {
      // Obtener nuevo leaderboard
      const leaderboard = await this.fetchLeaderboard();
      this.updateLeaderboard(leaderboard);
      
      // Llenar colas con nuevo rango
      this.populateQueues();
      
      console.log(`✅ Successfully switched to ${range} with ${leaderboard.length} players`);
    } catch (error) {
      console.error(`Failed to switch to ${range}:`, error);
      throw error;
    }
  }

  // Obtener leaderboard según el rango configurado
  private async fetchLeaderboard(): Promise<LeaderboardEntry[]> {
    if (this.topRange === 'top300') {
      const result = await skyMavisService.fetchTop300();
      return [...result.top100, ...result.top200, ...result.top300];
    } else {
      const result = await skyMavisService.fetchTop200();
      return [...result.top100, ...result.top200];
    }
  }

  // Iniciar el loop principal
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Starting scheduler loop...');
    
    this.runLoop();
  }

  // Detener el scheduler
  stop(): void {
    this.isRunning = false;
    console.log('Scheduler stopped');
  }

  // Loop principal del scheduler
  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const now = Date.now();
        
        // Refrescar leaderboard cada 20s
        if (now - this.lastLeaderboardRefresh >= config.windows.refreshLeaderboard) {
          await this.refreshLeaderboard();
        }

        // Procesar items listos
        const readyItems = this.priorityQueue.getReadyItems(now);
        if (readyItems.length > 0) {
          await this.processItems(readyItems);
        }

        // Limpiar expirados cada 5-10s
        if (now % 10000 < 100) {
          state.pruneExpired();
        }

        // Actualizar métricas
        this.updateMetrics();

        // Esperar un poco antes del siguiente ciclo
        await this.sleep(100);
      } catch (error) {
        console.error('Error in scheduler loop:', error);
        await this.sleep(1000); // Esperar más en caso de error
      }
    }
  }

  // Procesar items de las colas
  private async processItems(items: QueueItem[]): Promise<void> {
    this.processedInTick.clear();
    
    for (const item of items) {
      try {
        await this.processPlayer(item.userId);
      } catch (error) {
        console.error(`Error processing player ${item.userId}:`, error);
      }
    }

    // Reinsertar items con nuevos tiempos de polling
    const now = Date.now();
    const hotItems = items.filter(item => item.priority === 'hot');
    const coldItems = items.filter(item => item.priority === 'cold');

    // Hot: 15-20s aleatorio
    if (hotItems.length > 0) {
      const hotNextPoll = now + 15000 + Math.random() * 5000;
      this.priorityQueue.reinsertItems(hotItems, hotNextPoll);
    }

    // Cold: 60-90s aleatorio
    if (coldItems.length > 0) {
      const coldNextPoll = now + 60000 + Math.random() * 30000;
      this.priorityQueue.reinsertItems(coldItems, coldNextPoll);
    }
  }

  // Procesar un jugador específico
  private async processPlayer(userId: string): Promise<void> {
    // Marcar como procesado en este tick
    this.processedInTick.add(userId);

    // Obtener datos del leaderboard
    const leaderboardEntry = this.leaderboardMap.get(userId);
    if (!leaderboardEntry) {
      console.warn(`Player ${userId} not found in leaderboard`);
      return;
    }

    // Obtener battle log
    const battleLog = await skyMavisService.fetchLatestRankedLog(userId);
    if (!battleLog) {
      return;
    }

    // Verificar si es reciente (últimos 5 minutos)
    const now = Date.now();
    const endedAtMs = battleLog.gameData.endedAt * 1000;
    const isRecent = now - endedAtMs <= config.windows.active;

    // Crear ActivePlayer
    // Images will be loaded by the frontend using the new system
    const images: string[] = [];

    const activePlayer: ActivePlayer = {
      userId,
      name: leaderboardEntry.name,
      rank: leaderboardEntry.rank,
      topRank: leaderboardEntry.topRank,
      vstar: leaderboardEntry.vstar,
      rankChange: 0, // TODO: Calcular cambio de rank
      battleEndedAt: endedAtMs,
      endedAtLocalISO: new Date(endedAtMs).toISOString(),
      endedAtEpoch: battleLog.gameData.endedAt,
      recent: isRecent,
      axies: images,
      won: false, // TODO: Determinar si ganó
    };

    // Upsert al estado
    state.upsertActive(activePlayer);

    // Dedupe rival Top100
    const rivalId = skyMavisService.getRivalFromLog(battleLog, userId);
    if (rivalId && this.leaderboardMap.has(rivalId) && !this.processedInTick.has(rivalId)) {
      await this.processRivalFromLog(rivalId, battleLog, leaderboardEntry);
    }

    // Cambiar prioridad basado en actividad reciente
    const newPriority = isRecent ? 'hot' : 'cold';
    this.priorityQueue.changePriority(userId, newPriority);
  }

  // Procesar rival usando el mismo battle log (dedupe)
  private async processRivalFromLog(rivalId: string, battleLog: any, originalPlayer: LeaderboardEntry): Promise<void> {
    this.processedInTick.add(rivalId);

    const rivalEntry = this.leaderboardMap.get(rivalId);
    if (!rivalEntry) return;

    const now = Date.now();
    const endedAtMs = battleLog.gameData.endedAt * 1000;
    const isRecent = now - endedAtMs <= config.windows.active;

    // Images will be loaded by the frontend using the new system
    const images: string[] = [];

    const rivalPlayer: ActivePlayer = {
      userId: rivalId,
      name: rivalEntry.name,
      rank: rivalEntry.rank,
      topRank: rivalEntry.topRank,
      vstar: rivalEntry.vstar,
      rankChange: 0, // TODO: Calcular cambio de rank
      battleEndedAt: endedAtMs,
      endedAtLocalISO: new Date(endedAtMs).toISOString(),
      endedAtEpoch: battleLog.gameData.endedAt,
      recent: isRecent,
      axies: images,
      won: false, // TODO: Determinar si ganó
    };

    state.upsertActive(rivalPlayer);
    
    const newPriority = isRecent ? 'hot' : 'cold';
    this.priorityQueue.changePriority(rivalId, newPriority);
  }

  // Refrescar leaderboard
  private async refreshLeaderboard(): Promise<void> {
    try {
      const leaderboard = await this.fetchLeaderboard();
      this.updateLeaderboard(leaderboard);
      this.lastLeaderboardRefresh = Date.now();
    } catch (error) {
      console.error('Error refreshing leaderboard:', error);
    }
  }

  // Actualizar leaderboard y ajustar colas
  private updateLeaderboard(leaderboard: LeaderboardEntry[]): void {
    this.leaderboardMap.clear();
    
    for (const entry of leaderboard) {
      this.leaderboardMap.set(entry.userId, entry);
    }

    state.updateLeaderboard(leaderboard);
    this.populateQueues();
  }

  // Poblar colas con jugadores del leaderboard
  private populateQueues(): void {
    const now = Date.now();
    
    for (const [userId, entry] of this.leaderboardMap) {
      // Verificar si ya existe en las colas
      const existingHot = this.priorityQueue.getStats().hotQueueMapSize;
      const existingCold = this.priorityQueue.getStats().coldQueueMapSize;
      
      if (existingHot + existingCold >= this.leaderboardMap.size) {
        continue; // Ya está en las colas
      }

      // Determinar prioridad inicial basada en rank
      // Hot: Top 50 (alta prioridad), Cold: resto (baja prioridad)
      const priority: 'hot' | 'cold' = entry.topRank <= 50 ? 'hot' : 'cold';
      
      // Tiempo inicial de polling
      const initialDelay = priority === 'hot' 
        ? 5000 + Math.random() * 10000  // 5-15s para hot
        : 30000 + Math.random() * 30000; // 30-60s para cold

      const queueItem: QueueItem = {
        userId,
        nextPollAt: now + initialDelay,
        priority,
      };

      this.priorityQueue.enqueue(queueItem);
    }
  }

  // Actualizar métricas
  private updateMetrics(): void {
    const now = Date.now();
    const timeDiff = (now - this.lastMetricsUpdate) / 1000;
    
    if (timeDiff >= 1) {
      this.movingAvgRPS = this.requestCount / timeDiff;
      this.requestCount = 0;
      this.lastMetricsUpdate = now;
    }
  }

  // Obtener estadísticas de runtime
  getRuntimeStats(): RuntimeStats {
    const queueStats = this.priorityQueue.getStats();
    const limiterMetrics = rateLimiter.getMetrics();
    const stateStats = state.getStats();

    const pendingItems = queueStats.hotQueueSize + queueStats.coldQueueSize;
    const etaSeconds = this.movingAvgRPS > 0 ? pendingItems / this.movingAvgRPS : 0;

    return {
      rps: this.movingAvgRPS,
      etaSeconds: Math.max(0, etaSeconds),
      globalRemaining: limiterMetrics.globalRemaining,
      hotQueueSize: queueStats.hotQueueSize,
      coldQueueSize: queueStats.coldQueueSize,
      activePlayersCount: stateStats.recentPlayers,
    };
  }

  // Obtener el rango actual
  getTopRange(): 'top200' | 'top300' {
    return this.topRange;
  }

  // Utilidad para sleep
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}export const scheduler = new Scheduler();


