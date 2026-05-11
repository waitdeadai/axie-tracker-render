import { state } from './state';
import { skyMavisService } from '../services/skyMavis';
import { config } from '../config';

export class SimpleScheduler {
  private isRunning = false;
  private interval: NodeJS.Timeout | null = null;

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🚀 Starting Simple Scheduler (leaderboard-only mode)...');
    
    // Ejecutar inmediatamente y luego cada 5 segundos
    this.refreshLeaderboard();
    this.interval = setInterval(() => {
      if (this.isRunning) {
        this.refreshLeaderboard();
      }
    }, 5000); // 5 segundos
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log('⏹️ Simple Scheduler stopped');
  }

  private async refreshLeaderboard(): Promise<void> {
    try {
      console.log('📊 Fetching leaderboard...');
      const result = await skyMavisService.fetchTop200();
      const allPlayers = [...result.top100, ...result.top200];
      
      // Actualizar el estado con la nueva información del leaderboard
      state.updateLeaderboard(allPlayers);
      
      console.log(`✅ Updated leaderboard with ${allPlayers.length} players`);
      
      // Limpiar jugadores expirados
      state.pruneExpired();
      
    } catch (error) {
      console.error('❌ Error refreshing leaderboard:', error.message);
    }
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      timestamp: new Date().toISOString()
    };
  }
}

export const simpleScheduler = new SimpleScheduler();
