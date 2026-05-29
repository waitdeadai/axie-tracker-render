import { Database } from 'node-sqlite3-wasm';
import fs from 'fs';
import path from 'path';
import { ActivePlayer } from '../core/types';

interface SessionEvent {
  userId: string;
  sessionStart: number; // TRUE session start — set once, never overwritten
  timestamp: number;    // last-activity time (rolling) — used for gap detection
  vstar: number;
  vstar_start: number; // Captured once at session start, never overwritten
  action: 'start' | 'continue' | 'end';
  playerName: string;
  topRank: number;
  gameCount: number;
}

interface SessionData {
  user_id: string;
  player_name: string;
  session_start: number;
  session_end: number;
  duration_minutes: number;
  games_played: number;
  vstar_start: number;
  vstar_end: number;
  vstar_change: number;
  hour_of_day: number;
  day_of_week: number;
  top_rank: number;
}

export class LocalSessionTracker {
  private db: Database;
  private activeSessions: Map<string, SessionEvent> = new Map();
  private readonly SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutos sin actividad = fin de sesión
  private readonly MIN_SESSION_DURATION = 2 * 60 * 1000; // Mínimo 2 minutos para contar como sesión

  constructor() {
    // Usar ruta absoluta basada en DATA_DIR o el directorio actual
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'sessions.db');
    
    console.log(`📊 Using database at: ${dbPath}`);
    this.db = new Database(dbPath);
    this.initDatabase();
    
    // Cleanup de sesiones colgadas cada 5 minutos
    setInterval(() => this.cleanupStaleSessions(), 5 * 60 * 1000);
  }

  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        session_start INTEGER NOT NULL,
        session_end INTEGER NOT NULL,
        duration_minutes INTEGER NOT NULL,
        games_played INTEGER DEFAULT 1,
        vstar_start INTEGER NOT NULL,
        vstar_end INTEGER NOT NULL,
        vstar_change INTEGER NOT NULL,
        hour_of_day INTEGER NOT NULL,
        day_of_week INTEGER NOT NULL,
        top_rank INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_user_sessions 
      ON player_sessions(user_id, session_start);

      CREATE INDEX IF NOT EXISTS idx_session_time 
      ON player_sessions(session_start, day_of_week, hour_of_day);
    `);

    console.log('📊 SessionTracker database initialized');
  }

  public processPlayerActivity(player: ActivePlayer, now: number = Date.now()): void {
    const lastActivity = this.activeSessions.get(player.userId);

    if (!lastActivity) {
      // Nueva sesión
      this.startSession(player, now);
    } else {
      // Verificar si continúa la sesión o inicia una nueva
      const timeSinceLastActivity = now - lastActivity.timestamp;

      if (timeSinceLastActivity > this.SESSION_TIMEOUT) {
        // Gap muy largo = nueva sesión. The prior session really ended at its
        // LAST game (lastActivity.timestamp), not "now minus timeout".
        this.endSession(lastActivity, lastActivity.timestamp);
        this.startSession(player, now);
      } else {
        // Continuar sesión existente
        this.continueSession(player, now);
      }
    }
  }

  private startSession(player: ActivePlayer, timestamp: number): void {
    const sessionEvent: SessionEvent = {
      userId: player.userId,
      sessionStart: timestamp, // TRUE start, never overwritten on continue
      timestamp,               // rolling last-activity
      vstar: player.vstar,
      vstar_start: player.vstar, // Capture initial vstar
      action: 'start',
      playerName: player.name,
      topRank: player.topRank,
      gameCount: 1
    };

    this.activeSessions.set(player.userId, sessionEvent);
    console.log(`📅 Session started: ${player.name} (#${player.topRank}) at ${new Date(timestamp).toLocaleTimeString()}`);
  }

  private continueSession(player: ActivePlayer, timestamp: number): void {
    const sessionEvent = this.activeSessions.get(player.userId);
    if (sessionEvent) {
      // Actualizar timestamp y VStar
      sessionEvent.timestamp = timestamp;
      sessionEvent.vstar = player.vstar;
      sessionEvent.action = 'continue';
      sessionEvent.gameCount++;
      
      // Log solo cambios significativos de VStar
      const existingVstar = sessionEvent.vstar;
      if (Math.abs(player.vstar - existingVstar) > 0) {
        console.log(`🎮 ${player.name} continues session: VStar ${existingVstar} -> ${player.vstar}`);
      }
    }
  }

  private endSession(sessionEvent: SessionEvent, endTime?: number): void {
    const actualEndTime = endTime || Date.now();
    // Duration is measured from the TRUE session start to the end (last game),
    // not from the last activity — so a multi-game session is not under-counted.
    const duration = actualEndTime - sessionEvent.sessionStart;

    // Solo guardar sesiones que duran al menos el mínimo
    if (duration < this.MIN_SESSION_DURATION) {
      console.log(`⏱️ Session too short for ${sessionEvent.playerName}, not saving (${Math.floor(duration / 1000)}s)`);
      this.activeSessions.delete(sessionEvent.userId);
      return;
    }

    const sessionData: SessionData = {
      user_id: sessionEvent.userId,
      player_name: sessionEvent.playerName,
      session_start: sessionEvent.sessionStart,
      session_end: actualEndTime,
      duration_minutes: Math.floor(duration / 60000),
      games_played: sessionEvent.gameCount,
      vstar_start: sessionEvent.vstar_start, // Original vstar at session start
      vstar_end: sessionEvent.vstar, // Updated continuously via continueSession
      vstar_change: sessionEvent.vstar - sessionEvent.vstar_start, // end - start
      hour_of_day: new Date(sessionEvent.sessionStart).getHours(),
      day_of_week: new Date(sessionEvent.sessionStart).getDay(),
      top_rank: sessionEvent.topRank
    };

    this.saveSession(sessionData);
    this.activeSessions.delete(sessionEvent.userId);

    console.log(`📝 Session ended: ${sessionEvent.playerName} - Duration: ${sessionData.duration_minutes}m`);
  }

  private saveSession(sessionData: SessionData): void {
    const query = `
      INSERT INTO player_sessions (
        user_id, player_name, session_start, session_end, duration_minutes,
        games_played, vstar_start, vstar_end, vstar_change,
        hour_of_day, day_of_week, top_rank
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      const stmt = this.db.prepare(query);
      stmt.run([
        sessionData.user_id,
        sessionData.player_name,
        sessionData.session_start,
        sessionData.session_end,
        sessionData.duration_minutes,
        sessionData.games_played,
        sessionData.vstar_start,
        sessionData.vstar_end,
        sessionData.vstar_change,
        sessionData.hour_of_day,
        sessionData.day_of_week,
        sessionData.top_rank
      ]);
      console.log(`✅ Session saved for ${sessionData.player_name}`);
    } catch (err) {
      console.error('❌ Error saving session:', err);
    }
  }

  private cleanupStaleSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [userId, sessionEvent] of this.activeSessions) {
      const timeSinceLastActivity = now - sessionEvent.timestamp;
      
      if (timeSinceLastActivity > this.SESSION_TIMEOUT) {
        // Session ended at its last game, not timeout-later.
        this.endSession(sessionEvent, sessionEvent.timestamp);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} stale sessions`);
    }
  }

  // Métodos para obtener estadísticas
  public getSessionCount(userId: string): number {
    try {
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM player_sessions WHERE user_id = ?');
      const result = stmt.get([userId]) as { count: number };
      return result.count;
    } catch (err) {
      console.error('❌ Error getting session count:', err);
      return 0;
    }
  }

  public getRecentSessions(userId: string, days: number = 30): any[] {
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM player_sessions 
        WHERE user_id = ? AND session_start > ? 
        ORDER BY session_start DESC
      `);
      return stmt.all([userId, cutoffTime]);
    } catch (err) {
      console.error('❌ Error getting recent sessions:', err);
      return [];
    }
  }

  public getActiveSessions(): Map<string, SessionEvent> {
    return new Map(this.activeSessions);
  }

  public close(): void {
    try {
      this.db.close();
      console.log('📊 SessionTracker database closed');
    } catch (err) {
      console.error('❌ Error closing database:', err);
    }
  }
}
