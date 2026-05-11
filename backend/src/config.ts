import * as dotenv from 'dotenv';
dotenv.config();

const getEnvVar = (name: string, defaultValue?: string): string => {
  const value = process.env[name];
  if (!value && defaultValue === undefined) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value || defaultValue!;
};

const getEnvNumber = (name: string, defaultValue?: number): number => {
  const value = process.env[name];
  if (!value && defaultValue === undefined) {
    throw new Error(`Environment variable ${name} is not set`);
  }

  const resolvedValue = value ?? String(defaultValue);
  const numericValue = Number(resolvedValue);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }

  return numericValue;
};

const getEnvList = (name: string, defaultValues: string[] = []): string[] => {
  const value = process.env[name];
  if (!value) {
    return defaultValues;
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export const config = {
  port: getEnvNumber('PORT', 4000),

  payment: {
    paymentWalletAddress: getEnvVar('PAYMENT_WALLET_ADDRESS', 'ronin:0000000000000000000000000000000000000000'),
    paymentWalletPrivateKey: getEnvVar('PAYMENT_WALLET_PRIVATE_KEY', ''),
    roninRpcUrl: getEnvVar('RONIN_RPC_URL', 'https://ronin.drpc.org'),
    usdcContract: getEnvVar('USDC_CONTRACT', '0x9433e1776c043289c0a5aba2eb9ff8dd1e8471c3'),
    ronDecimals: getEnvNumber('RON_DECIMALS', 18),
    usdcDecimals: getEnvNumber('USDC_DECIMALS', 6),
    plans: {
      usdc: {
        '2weeks': getEnvNumber('PLANS_USDC_2WEEKS', 2),
        '1month': getEnvNumber('PLANS_USDC_1MONTH', 5),
        '3month': getEnvNumber('PLANS_USDC_3MONTH', 12),
        '1year': getEnvNumber('PLANS_USDC_1YEAR', 40)
      },
      ron: {
        '2weeks': getEnvNumber('PLANS_RON_2WEEKS', 20),
        '1month': getEnvNumber('PLANS_RON_1MONTH', 50),
        '3month': getEnvNumber('PLANS_RON_3MONTH', 120),
        '1year': getEnvNumber('PLANS_RON_1YEAR', 400)
      }
    }
  },

  urls: {
    leaderboard: getEnvVar(
      'LEADERBOARD_URL',
      'https://api-gateway.skymavis.com/origins/v2/season-leaderboards'
    ),
    battleLog: getEnvVar(
      'BATTLE_LOG_URL',
      'https://api-gateway.skymavis.com/origins/v2/battle-history/:client_id'
    ),
    axieTop: getEnvVar('AXIE_TOP_URL', 'https://axie.top')
  },

  windows: {
    active: getEnvNumber('ACTIVE_WINDOW_MS', 300000),
    refresh: getEnvNumber('REFRESH_LEADERBOARD_MS', 20000),
    refreshLeaderboard: getEnvNumber('REFRESH_LEADERBOARD_MS', 20000),
    battleLogTtl: getEnvNumber('BATTLELOG_TTL_MS', 45000),
    imagesTtl: getEnvNumber('IMAGES_TTL_MS', 300000)
  },

  rateLimiting: {
    keys: getEnvNumber('KEYS', 5),
    keyRps: getEnvNumber('KEY_RPS', 5),
    keyRpm: getEnvNumber('KEY_RPM', 100),
    budgetRpm: getEnvNumber('BUDGET_RPM', 450),
    budgetRps: getEnvNumber('BUDGET_RPS', 20),
    globalReservoir: getEnvNumber('GLOBAL_RESERVOIR', 450),
    globalRefreshMs: getEnvNumber('GLOBAL_REFRESH_MS', 60000),
    requestTimeoutMs: getEnvNumber('REQUEST_TIMEOUT_MS', 3000)
  },

  apiKeys: getEnvList('ORIGINS_API_KEYS'),
  apiKey: getEnvVar('API_KEY'),
  apiKeyHeader: getEnvVar('ORIGINS_API_KEY_HEADER', 'X-API-Key'),

  blogKeys: getEnvList('ORIGINS_BLOG_KEYS', getEnvList('ORIGINS_API_KEYS')),
  blogEndpoint: getEnvVar(
    'ORIGINS_BLOG_ENDPOINT',
    'https://api-gateway.skymavis.com/origin/v2'
  ),
  axieTopSecretKey: getEnvVar('AXIE_TOP_SECRET_KEY', ''),

  cors: {
    origins: getEnvList('CORS_ORIGIN', ['http://localhost:5174'])
  }
};
