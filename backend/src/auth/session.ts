import session from 'express-session';

const DEFAULT_DEV_SESSION_SECRET = 'axie-dev-session-secret';
const isProduction = process.env.NODE_ENV === 'production';

function cleanEnvValue(value?: string): string {
  return (value || '').trim();
}

function getSessionSecret(): string {
  const secret =
    cleanEnvValue(process.env.SESSION_SECRET) ||
    cleanEnvValue(process.env.JWT_SECRET) ||
    (isProduction ? '' : DEFAULT_DEV_SESSION_SECRET);
  if (!secret) {
    throw new Error('SESSION_SECRET or JWT_SECRET must be set in production');
  }
  return secret;
}

export const sessionMiddleware = session({
  secret: getSessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: isProduction,
    httpOnly: true
  }
});
