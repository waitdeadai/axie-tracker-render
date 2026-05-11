import Bottleneck from 'bottleneck';
import { config } from '../env';

interface FetchOptions {
  url: string;
  init?: RequestInit;
  keyIndexOverride?: number;
}

interface LimiterMetrics {
  movingAvgRPS: number;
  keyConsumption: number[];
  globalRemaining: number;
}

class RateLimiter {
  private keyLimiters: Bottleneck[];
  private globalLimiter: Bottleneck;
  private currentKeyIndex = 0;
  private requestCounts: number[] = [];
  private lastResetTime = Date.now();
  private movingAvgRPS = 0;
  private requestTimes: number[] = [];

  constructor() {
    // Crear pool de limiters por key
    this.keyLimiters = config.apiKeys.map((_, index) => {
      return new Bottleneck({
        minTime: 100, // 100ms mínimo para evitar spam
        reservoir: config.rateLimit.keyRPM,
        reservoirRefreshAmount: config.rateLimit.keyRPM,
        reservoirRefreshInterval: 60000, // 1 minuto
        maxConcurrent: 2, // Permitir 2 requests concurrentes por key
        id: `key-${index}`,
      });
    });

    // Crear limiter global
    this.globalLimiter = new Bottleneck({
      reservoir: config.rateLimit.globalReservoir,
      reservoirRefreshAmount: config.rateLimit.globalReservoir,
      reservoirRefreshInterval: config.rateLimit.globalRefreshMs,
      minTime: 0, // Sin delay mínimo para evitar bloqueos
      maxConcurrent: 10, // Permitir más concurrencia
      id: 'global',
    });

    // Inicializar contadores
    this.requestCounts = new Array(config.apiKeys.length).fill(0);

    // Configurar métricas
    setInterval(() => this.updateMetrics(), 1000);
  }

  private updateMetrics(): void {
    const now = Date.now();
    const timeDiff = (now - this.lastResetTime) / 1000;
    
    if (timeDiff >= 1) {
      // Calcular RPS promedio móvil
      this.requestTimes = this.requestTimes.filter(time => now - time < 60000); // Últimos 60s
      this.movingAvgRPS = this.requestTimes.length / 60;
      
      // Resetear contadores por key
      this.requestCounts.fill(0);
      this.lastResetTime = now;
    }
  }

  private getNextKeyIndex(): number {
    const keyIndex = this.currentKeyIndex;
    this.currentKeyIndex = (this.currentKeyIndex + 1) % config.apiKeys.length;
    return keyIndex;
  }

  private async fetchWithRetry(url: string, init: RequestInit, keyIndex: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.rateLimit.requestTimeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          ...init.headers,
          [config.apiKeyHeader]: config.apiKeys[keyIndex],
        },
      });

      clearTimeout(timeoutId);

      if (response.status === 429 || response.status >= 500) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchWithRetry(url, init, keyIndex);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${config.rateLimit.requestTimeout}ms`);
      }
      
      throw error;
    }
  }

  async scheduleFetch({ url, init = {}, keyIndexOverride }: FetchOptions): Promise<Response> {
    const keyIndex = keyIndexOverride ?? this.getNextKeyIndex();
    
    console.log('🔍 Rate limiter: Starting scheduleFetch with key index:', keyIndex);
    
    // Registrar métricas
    this.requestCounts[keyIndex]++;
    this.requestTimes.push(Date.now());

    // Simplificar rate limiting - solo usar key limiter por ahora
    console.log('🔍 Rate limiter: Scheduling key limiter directly...');
    const response = await this.keyLimiters[keyIndex].schedule(() => {
      console.log('🔍 Rate limiter: Key limiter passed, making actual fetch...');
      return this.fetchWithRetry(url, init, keyIndex);
    });

    console.log('🔍 Rate limiter: Fetch completed successfully');
    return response;
  }

  getMetrics(): LimiterMetrics {
    return {
      movingAvgRPS: this.movingAvgRPS,
      keyConsumption: [...this.requestCounts],
      globalRemaining: (this.globalLimiter as any).reservoir || 0,
    };
  }
}

export const rateLimiter = new RateLimiter();
