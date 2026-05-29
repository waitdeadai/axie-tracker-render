import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().transform(Number).default('4001'),
  API_KEY: z.string().min(1),
  ORIGINS_API_KEYS: z.string(),
  ORIGINS_API_KEY_HEADER: z.string().default('X-API-Key'),
  LEADERBOARD_URL: z.string().url(),
  BATTLE_LOG_URL: z.string().url(),
  AXIE_TOP_URL: z.string().url(),
  ACTIVE_WINDOW_MS: z.string().transform(Number).default('300000'),
  REFRESH_LEADERBOARD_MS: z.string().transform(Number).default('20000'),
  BATTLELOG_TTL_MS: z.string().transform(Number).default('45000'),
  IMAGES_TTL_MS: z.string().transform(Number).default('300000'),
  KEYS: z.string().transform(Number).default('5'),
  KEY_RPS: z.string().transform(Number).default('5'),
  KEY_RPM: z.string().transform(Number).default('100'),
  BUDGET_RPM: z.string().transform(Number).default('450'),
  BUDGET_RPS: z.string().transform(Number).default('7.5'),
  GLOBAL_RESERVOIR: z.string().transform(Number).default('450'),
  GLOBAL_REFRESH_MS: z.string().transform(Number).default('60000'),
  REQUEST_TIMEOUT_MS: z.string().transform(Number).default('5000'),
});

const env = envSchema.parse(process.env);

export const config = {
  port: env.PORT,
  apiKeys: env.ORIGINS_API_KEYS.split(','),
  apiKeyHeader: env.ORIGINS_API_KEY_HEADER,
  urls: {
    leaderboard: env.LEADERBOARD_URL,
    battleLog: env.BATTLE_LOG_URL,
    axieTop: env.AXIE_TOP_URL,
  },
  windows: {
    active: env.ACTIVE_WINDOW_MS,
    refreshLeaderboard: env.REFRESH_LEADERBOARD_MS,
    battleLogTTL: env.BATTLELOG_TTL_MS,
    imagesTTL: env.IMAGES_TTL_MS,
  },
  rateLimit: {
    keys: env.KEYS,
    keyRPS: env.KEY_RPS,
    keyRPM: env.KEY_RPM,
    budgetRPM: env.BUDGET_RPM,
    budgetRPS: env.BUDGET_RPS,
    globalReservoir: env.GLOBAL_RESERVOIR,
    globalRefreshMs: env.GLOBAL_REFRESH_MS,
    requestTimeout: env.REQUEST_TIMEOUT_MS,
  },
} as const;
