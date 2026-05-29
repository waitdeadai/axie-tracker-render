import { API_BASE } from './api.config';

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
  address?: string;
}

export type PlanId = '2weeks' | '1month' | '3month' | '1year';

export interface AccessStatus {
  address: string;
  hasAccess: boolean;
  plan: PlanId | null;
  expiresAt: number | null;
  whitelisted: boolean;
}

export interface VerifyResponse extends AccessStatus {
  token: string;
}

export interface PaymentIntent {
  to: string;
  token: string;
  tokenContract: string;
  chainId: number;
  decimals: number;
  amount: string;
  humanAmount: string;
  plan: PlanId;
}

export interface ClaimResponse {
  hasAccess: boolean;
  expiresAt: number | null;
  plan: PlanId | null;
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

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    return body.error || body.message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export interface RivalStatus {
  playerUserId: string;
  playerName: string;
  online: boolean;
  topRank: number | null;
  vstar: number | null;
  lastBattleAt: number | null;
  won: boolean | null;
}

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

  // Public, count-only paywall teaser. Tolerant: returns 0 on any error so the
  // PayGate can fall back to its always-true "radar is running" copy.
  async getActiveCount(): Promise<number> {
    try {
      const response = await fetch(`${API_BASE}/live/active-count`, {
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) return 0;
      const data = (await response.json()) as { count?: number };
      return typeof data.count === 'number' ? data.count : 0;
    } catch {
      return 0;
    }
  },

  // --- Rival watchlist (paid "Live Rival Radar"). Session-cookie bound, so
  // credentials:'include' is mandatory alongside the JWT auth headers. ---
  async getWatchlist(): Promise<RivalStatus[]> {
    const response = await fetch(`${API_BASE}/watchlist`, {
      credentials: 'include',
      headers: TokenManager.getAuthHeaders()
    });
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    const data = (await response.json()) as { rivals: RivalStatus[] };
    return data.rivals;
  },

  async addWatch(playerUserId: string, playerName: string): Promise<void> {
    const response = await fetch(`${API_BASE}/watchlist`, {
      method: 'POST',
      credentials: 'include',
      headers: TokenManager.getAuthHeaders(),
      body: JSON.stringify({ playerUserId, playerName })
    });
    if (!response.ok) {
      throw new Error(await readError(response));
    }
  },

  async removeWatch(playerUserId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/watchlist/${encodeURIComponent(playerUserId)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: TokenManager.getAuthHeaders()
    });
    if (!response.ok) {
      throw new Error(await readError(response));
    }
  },

  // SIWE step 1: ask the server for a single-use nonce bound to the session
  // cookie. credentials:'include' is mandatory — the nonce lives in the session.
  async getNonce(): Promise<string> {
    const response = await fetch(`${API_BASE}/auth/nonce`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    const data = (await response.json()) as { nonce: string };
    return data.nonce;
  },

  // SIWE step 2: hand the signed EIP-4361 message back; the server verifies it,
  // pins the wallet onto the session, and returns a JWT for the gated data routes.
  async verifySiwe(message: string, signature: string): Promise<VerifyResponse> {
    const response = await fetch(`${API_BASE}/auth/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, signature })
    });
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    return response.json();
  },

  // On-chain access for the wallet pinned to this session.
  async getAccessStatus(): Promise<AccessStatus | null> {
    const response = await fetch(`${API_BASE}/access/status`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    if (response.status === 401) {
      return null;
    }
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    return response.json();
  },

  async getPaymentIntent(plan: PlanId): Promise<PaymentIntent> {
    const response = await fetch(`${API_BASE}/payment/intent?plan=${encodeURIComponent(plan)}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    return response.json();
  },

  // Submit a settled USDC transfer tx; the server verifies it on-chain (from ==
  // signed-in wallet, to == receiver, finalized, value >= price) then grants access.
  async claimPayment(txHash: string): Promise<ClaimResponse> {
    const response = await fetch(`${API_BASE}/payment/claim`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash })
    });
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    return response.json();
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch {
      // Server-side session teardown is best-effort; the client clears regardless.
    } finally {
      TokenManager.removeToken();
    }
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
  }
};

export const getPredictions = api.getPredictions;
export const getSessionSummary = api.getSessionSummary;
export const getNonce = api.getNonce;
export const verifySiwe = api.verifySiwe;
export const getAccessStatus = api.getAccessStatus;
export const getPaymentIntent = api.getPaymentIntent;
export const claimPayment = api.claimPayment;
export const logout = api.logout;
