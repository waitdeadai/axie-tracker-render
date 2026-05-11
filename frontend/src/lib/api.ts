import { API_BASE } from './api.config';

const APP_BASE_URL = import.meta.env.BASE_URL || '/';

export interface ActivePlayer {
  userId: string;
  name: string;
  rank: string;
  topRank: number;
  vstar: number;
  lastVstar?: number;
  lastTopRank?: number;
  rankChange: number;
  battleEndedAt: number;
  recent: boolean;
  axies: string[];
  won: boolean;
}

export interface ActiveResponse {
  updatedAt: string;
  rps: number;
  etaSeconds: number;
  players: ActivePlayer[];
}

export interface Prediction {
  time: string;
  datetime: string;
  probability: number;
  confidence: string;
  day: string;
  hours_from_now: number;
  reasoning: string;
}

export interface PredictionResponse {
  success: boolean;
  userId: string;
  predictions: Prediction[];
  generated_at: string;
  message?: string;
}

export interface SessionSummary {
  total_sessions: number;
  total_playtime_hours: number;
  avg_session_duration: number;
  avg_gap_between_sessions: number;
  favorite_hours: string[];
  favorite_days: string[];
  consistency: number;
  patterns_strength: number;
  predictability: string;
}

interface DecodedJwtPayload {
  exp?: number;
  id?: string;
  username?: string;
}

export interface AuthStatus {
  authenticated: boolean;
  authorized: boolean;
  user: {
    id: string;
    username: string;
    avatar: string | null;
  } | null;
}

export function decodeJwtPayload(token: string): DecodedJwtPayload | null {
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    return null;
  }

  try {
    const base64 = tokenParts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(tokenParts[1].length / 4) * 4, '=');

    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export const TokenManager = {
  getToken(): string | null {
    return localStorage.getItem('auth_token');
  },

  setToken(token: string): void {
    localStorage.setItem('auth_token', token);
  },

  removeToken(): void {
    localStorage.removeItem('auth_token');
  },

  isTokenExpired(token: string): boolean {
    const payload = decodeJwtPayload(token);
    if (!payload?.exp) {
      return true;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp < currentTime;
  },

  getAuthHeaders(): Record<string, string> {
    const token = this.getToken();

    if (token && !this.isTokenExpired(token)) {
      return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
    }

    if (token) {
      this.removeToken();
    }

    return {
      'Content-Type': 'application/json'
    };
  }
};

export const api = {
  async getActivePlayers(): Promise<ActiveResponse> {
    const response = await fetch(`${API_BASE}/active-players`, {
      headers: TokenManager.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async getAuthStatus(): Promise<AuthStatus> {
    try {
      const token = TokenManager.getToken();

      if (!token || TokenManager.isTokenExpired(token)) {
        TokenManager.removeToken();
        return {
          authenticated: false,
          authorized: false,
          user: null
        };
      }

      const response = await fetch(`${API_BASE}/auth/status`, {
        headers: TokenManager.getAuthHeaders()
      });

      if (!response.ok) {
        if (response.status === 401) {
          TokenManager.removeToken();
        }

        return {
          authenticated: false,
          authorized: false,
          user: null
        };
      }

      return response.json();
    } catch (_error) {
      return {
        authenticated: false,
        authorized: false,
        user: null
      };
    }
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: TokenManager.getAuthHeaders()
      });
    } catch (_error) {
      // Client-side token removal is the important part.
    } finally {
      TokenManager.removeToken();
      window.location.href = APP_BASE_URL;
    }
  },

  loginWithDiscord() {
    window.location.href = `${API_BASE}/auth/discord`;
  },

  async getPredictions(userId: string): Promise<PredictionResponse> {
    const response = await fetch(`${API_BASE}/predictions/${userId}`, {
      headers: TokenManager.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async getSessionSummary(userId: string): Promise<{ summary: SessionSummary }> {
    const response = await fetch(`${API_BASE}/sessions/${userId}`, {
      headers: TokenManager.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async getHealth(): Promise<{
    status: string;
    timestamp: string;
    config: {
      activeWindow: number;
      refreshInterval: number;
      imagesTtl: number;
      apiKeys: number;
    };
  }> {
    const response = await fetch(`${API_BASE}/health`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }
};

export const getActivePlayers = api.getActivePlayers;
export const getPredictions = api.getPredictions;
export const getSessionSummary = api.getSessionSummary;
export const getHealth = api.getHealth;
export const getAuthStatus = api.getAuthStatus;
export const loginWithDiscord = api.loginWithDiscord;
export const logout = api.logout;
