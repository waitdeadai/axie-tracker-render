import Bottleneck from 'bottleneck';
import { config } from '../config';

interface FetchOptions {
  url: string;
  options?: RequestInit;
}

class RateLimiter {
  private keyLimiters: Bottleneck[];
  private globalLimiter: Bottleneck;
  private currentKeyIndex: number;

  constructor() {
    this.keyLimiters = config.apiKeys.map(
      () =>
        new Bottleneck({
          reservoir: config.rateLimiting.keyRpm,
          reservoirRefreshAmount: config.rateLimiting.keyRpm,
          reservoirRefreshInterval: 60 * 1000,
          maxConcurrent: 1,
          minTime: Math.ceil(1000 / config.rateLimiting.keyRps)
        })
    );

    this.globalLimiter = new Bottleneck({
      reservoir: config.rateLimiting.globalReservoir,
      reservoirRefreshAmount: config.rateLimiting.globalReservoir,
      reservoirRefreshInterval: config.rateLimiting.globalRefreshMs,
      maxConcurrent: config.rateLimiting.budgetRps,
      minTime: Math.ceil(1000 / config.rateLimiting.budgetRps)
    });

    this.currentKeyIndex = 0;
  }

  private getNextKeyIndex(): number {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % config.apiKeys.length;
    return this.currentKeyIndex;
  }

  async scheduleFetch({ url, options = {} }: FetchOptions): Promise<Response> {
    const keyIndex = this.getNextKeyIndex();

    try {
      await this.globalLimiter.schedule(() => Promise.resolve());
      await this.keyLimiters[keyIndex].schedule(() => Promise.resolve());

      const controller = options.signal ? null : new AbortController();
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), config.rateLimiting.requestTimeoutMs)
        : null;

      const fetchOptions: RequestInit = {
        ...options,
        headers: {
          ...options.headers,
          [config.apiKeyHeader]: config.apiKeys[keyIndex]
        },
        signal: options.signal || controller?.signal
      };

      try {
        return await fetch(url, fetchOptions);
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    } catch (error) {
      console.error('Rate limiter error:', error);
      throw error;
    }
  }
}

export const rateLimiter = new RateLimiter();
