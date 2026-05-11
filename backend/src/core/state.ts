import { LeaderboardEntry, ActivePlayer } from './types';
import { config } from '../config';

class State {
  private activePlayers: Map<string, ActivePlayer>;
  private leaderboard: LeaderboardEntry[];

  constructor() {
    this.activePlayers = new Map();
    this.leaderboard = [];
  }

  upsertActive(player: ActivePlayer): void {
    const existing = this.activePlayers.get(player.userId);
    if (existing) {
      // Si el jugador ya existe, verificar si esto es una actualización de tiempo
      if (player.battleEndedAt > existing.battleEndedAt) {
        console.log(`⏱️ Updating last battle time for ${player.name} (#${player.topRank}): ${new Date(existing.battleEndedAt).toISOString()} -> ${new Date(player.battleEndedAt).toISOString()}`);
      }
    } else {
      console.log(`✨ New active player: ${player.name} (#${player.topRank})`);
    }
    this.activePlayers.set(player.userId, player);
  }

  getPlayer(userId: string): ActivePlayer | undefined {
    return this.activePlayers.get(userId);
  }

  updateLeaderboard(entries: LeaderboardEntry[]): void {
    this.leaderboard = entries;
  }

  getSnapshot(): ActivePlayer[] {
    const now = Date.now();
    const activeWindow = config.windows.active;
    let inactiveCount = 0;
    
    // Limpiar jugadores inactivos
    for (const [userId, player] of this.activePlayers) {
      const timeSinceLastBattle = now - player.battleEndedAt;
      if (timeSinceLastBattle > activeWindow) {
        const minutes = Math.floor(timeSinceLastBattle / 60000);
        console.log(`🗑️ Removing inactive player: ${player.name} (#${player.topRank}) - No activity for ${minutes} minutes`);
        this.activePlayers.delete(userId);
        inactiveCount++;
      }
    }

    if (inactiveCount > 0) {
      console.log(`🧹 Cleaned up ${inactiveCount} inactive players`);
    }

    // Obtener jugadores activos
    const activePlayers = Array.from(this.activePlayers.values())
      .filter(player => now - player.battleEndedAt <= activeWindow)
      .sort((a, b) => a.topRank - b.topRank);

    // Log de jugadores activos con rank > 200
    const highRankPlayers = activePlayers.filter(p => p.topRank > 200);
    if (highRankPlayers.length > 0) {
      console.log('⚠️ Players with rank > 200:', highRankPlayers.map(p => ({
        name: p.name,
        rank: p.topRank,
        lastBattle: new Date(p.battleEndedAt).toISOString()
      })));
    }

    // Log resumen de jugadores activos
    const recentlyActive = activePlayers.filter(p => now - p.battleEndedAt <= 60000); // último minuto
    if (recentlyActive.length > 0) {
      console.log(`👥 Currently active: ${activePlayers.length} players (${recentlyActive.length} in last minute)`);
    }

    // Debug: Log de rango de topRank de jugadores activos
    if (activePlayers.length > 0) {
      const topRankRange = activePlayers.map(p => p.topRank).sort((a, b) => a - b);
      console.log(`📊 Backend: Enviando ${activePlayers.length} jugadores activos, rango topRank: ${topRankRange[0]} - ${topRankRange[topRankRange.length - 1]}`);
    }

    return activePlayers;
  }

  getAllPlayers(): LeaderboardEntry[] {
    return this.leaderboard.sort((a, b) => a.topRank - b.topRank);
  }

  pruneExpired(): void {
    const now = Date.now();
    const activeWindow = config.windows.active;
    let inactiveCount = 0;
    
    // Limpiar jugadores inactivos
    for (const [userId, player] of this.activePlayers) {
      const timeSinceLastBattle = now - player.battleEndedAt;
      if (timeSinceLastBattle > activeWindow) {
        const minutes = Math.floor(timeSinceLastBattle / 60000);
        console.log(`🗑️ Removing inactive player: ${player.name} (#${player.topRank}) - No activity for ${minutes} minutes`);
        this.activePlayers.delete(userId);
        inactiveCount++;
      }
    }

    if (inactiveCount > 0) {
      console.log(`🧹 Cleaned up ${inactiveCount} inactive players`);
    }
  }

  getStats() {
    const now = Date.now();
    const activeWindow = config.windows.active;
    
    const recentPlayers = Array.from(this.activePlayers.values())
      .filter(player => now - player.battleEndedAt <= activeWindow).length;

    return {
      recentPlayers,
      totalPlayers: this.activePlayers.size,
      leaderboardSize: this.leaderboard.length
    };
  }
}

export const state = new State();