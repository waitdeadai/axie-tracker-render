export interface AuthConfig {
  discord: {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope: string[];
  };
  session: {
    secret: string;
    resave: boolean;
    saveUninitialized: boolean;
    cookie: {
      secure: boolean;
      maxAge: number;
    };
  };
  ownerDiscordId: string;
  allowedDiscordIds: string[];
}

const DEFAULT_ALLOWED_DISCORD_IDS = [
  '969845195988410388',
  '429035818087219200',
  '868483231228514385',
  '736140400594518087',
  '748436671086723154'
];
const DEFAULT_DEV_SESSION_SECRET = 'axie-dev-session-secret';
const isProduction = process.env.NODE_ENV === 'production';

function parseCsvEnv(value?: string): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanEnvValue(value?: string): string {
  return (value || '').trim();
}

const configuredAllowedDiscordIds = parseCsvEnv(process.env.ALLOWED_DISCORD_IDS);
const allowedDiscordIds =
  configuredAllowedDiscordIds.length > 0
    ? configuredAllowedDiscordIds
    : DEFAULT_ALLOWED_DISCORD_IDS;

const sessionSecret =
  cleanEnvValue(process.env.SESSION_SECRET) ||
  cleanEnvValue(process.env.JWT_SECRET) ||
  (isProduction ? '' : DEFAULT_DEV_SESSION_SECRET);

export const authConfig: AuthConfig = {
  discord: {
    clientID: cleanEnvValue(process.env.DISCORD_CLIENT_ID),
    clientSecret: cleanEnvValue(process.env.DISCORD_CLIENT_SECRET),
    callbackURL:
      cleanEnvValue(process.env.DISCORD_CALLBACK_URL) ||
      'http://localhost:4000/api/auth/discord/callback',
    scope: ['identify', 'email']
  },
  session: {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000
    }
  },
  ownerDiscordId: DEFAULT_ALLOWED_DISCORD_IDS[0],
  allowedDiscordIds
};

export function isDiscordUserAllowed(discordId: string): boolean {
  return authConfig.allowedDiscordIds.includes(discordId);
}

export function hasDiscordAuthEnabled(): boolean {
  return Boolean(
    authConfig.discord.clientID &&
      authConfig.discord.clientSecret &&
      authConfig.discord.callbackURL &&
      authConfig.session.secret
  );
}

export function getAuthDisableReason(): string {
  if (!authConfig.discord.clientID) return 'missing DISCORD_CLIENT_ID';
  if (!authConfig.discord.clientSecret) return 'missing DISCORD_CLIENT_SECRET';
  if (!authConfig.discord.callbackURL) return 'missing DISCORD_CALLBACK_URL';
  if (!authConfig.session.secret) return 'missing SESSION_SECRET or JWT_SECRET';
  return 'unknown reason';
}

export function validateAuthConfig(): void {
  const { discord, allowedDiscordIds } = authConfig;

  if (!discord.clientID) {
    throw new Error('Missing DISCORD_CLIENT_ID environment variable');
  }

  if (!discord.clientSecret) {
    throw new Error('Missing DISCORD_CLIENT_SECRET environment variable');
  }

  if (!discord.callbackURL) {
    throw new Error('Missing DISCORD_CALLBACK_URL environment variable');
  }

  if (!authConfig.session.secret) {
    throw new Error('Missing SESSION_SECRET or JWT_SECRET environment variable');
  }

  if (isProduction && authConfig.session.secret === DEFAULT_DEV_SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be explicitly set in production');
  }

  if (configuredAllowedDiscordIds.length === 0) {
    console.warn(
      `Warning: ALLOWED_DISCORD_IDS not configured. Falling back to owner Discord ID ${authConfig.ownerDiscordId}`
    );
  } else {
    console.log(`Configured ${allowedDiscordIds.length} allowed Discord ID(s)`);
  }
}
