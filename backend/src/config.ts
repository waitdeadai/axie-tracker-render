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

  // SOTA-2026 on-chain access. The app only ever RECEIVES USDC to the owner
  // wallet on Ronin mainnet (chainId 2020). It never holds or requires a
  // private key — there is intentionally no paymentWalletPrivateKey here.
  payment: {
    // Receive-only owner wallet. EIP-55 checksummed 0x form.
    paymentWalletAddress: getEnvVar(
      'PAYMENT_WALLET_ADDRESS',
      '0x51a8318FBFf6DDFee50Ee0fb0f33AF02F34fF649'
    ),
    roninRpcUrl: getEnvVar('RONIN_RPC_URL', 'https://api.roninchain.com/rpc'),
    // Optional Sky Mavis API gateway key, sent as X-API-KEY when present.
    roninRpcApiKey: getEnvVar('RONIN_RPC_API_KEY', ''),
    chainId: getEnvNumber('RONIN_CHAIN_ID', 2020),
    // USDC on Ronin is bridged via Chainlink CCIP (NOT native Circle).
    usdcContract: getEnvVar('USDC_CONTRACT', '0x0b7007c13325c48911f73a2dad5fa5dcbf808adc'),
    usdcDecimals: getEnvNumber('USDC_DECIMALS', 6),
    // USDC-priced plans. amount = price * 10^usdcDecimals (computed at use site).
    plans: {
      '2weeks': { usdc: getEnvNumber('PLANS_USDC_2WEEKS', 2), days: 14 },
      '1month': { usdc: getEnvNumber('PLANS_USDC_1MONTH', 5), days: 30 },
      '3month': { usdc: getEnvNumber('PLANS_USDC_3MONTH', 12), days: 90 },
      '1year': { usdc: getEnvNumber('PLANS_USDC_1YEAR', 40), days: 365 }
    },
    pollIntervalMs: getEnvNumber('PAYMENT_POLL_INTERVAL_MS', 12000),
    pollEnabled: getEnvVar('PAYMENT_POLL_ENABLED', 'true') !== 'false',
    pollLookbackBlocks: getEnvNumber('PAYMENT_POLL_LOOKBACK_BLOCKS', 1800),
    // Moralis Streams webhook is optional; only verified when a secret is set.
    moralisStreamSecret: getEnvVar('MORALIS_STREAM_SECRET', ''),
    adminToken: getEnvVar('ADMIN_TOKEN', '')
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
