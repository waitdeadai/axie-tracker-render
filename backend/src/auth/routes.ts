import { Router } from 'express';
import {
  authConfig,
  hasDiscordAuthEnabled,
  isDiscordUserAllowed
} from './config';
import { generateToken, authenticateJWT, AuthenticatedRequest } from './jwt';

const router = Router();
const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_ME_URL = 'https://discord.com/api/v10/users/@me';

interface DiscordTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

interface DiscordUserProfile {
  id: string;
  username: string;
  avatar: string | null;
  email?: string;
}

function getFrontendRedirectBase(): string | null {
  const configured = (process.env.FRONTEND_URL || '').trim();
  return configured || null;
}

function buildRootRedirect(params: Record<string, string>): string {
  const frontendBase = getFrontendRedirectBase();
  if (frontendBase) {
    try {
      const url = new URL(frontendBase);

      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });

      return url.toString();
    } catch (error) {
      console.warn('Invalid FRONTEND_URL configured, falling back to relative redirect');
    }
  }

  const search = new URLSearchParams(params).toString();
  return search ? `/?${search}` : '/';
}

function buildDiscordAuthorizeUrl(): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: authConfig.discord.clientID,
    redirect_uri: authConfig.discord.callbackURL,
    scope: authConfig.discord.scope.join(' ')
  });

  return `${DISCORD_AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeDiscordCode(code: string): Promise<string | null> {
  const body = new URLSearchParams({
    client_id: authConfig.discord.clientID,
    client_secret: authConfig.discord.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: authConfig.discord.callbackURL,
    scope: authConfig.discord.scope.join(' ')
  });

  const response = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: body.toString()
  });

  const responseText = await response.text();
  let parsed: DiscordTokenResponse | Record<string, unknown> = {};

  try {
    parsed = responseText ? JSON.parse(responseText) : {};
  } catch (error) {
    console.error('Discord token exchange returned non-JSON body:', responseText);
    throw error;
  }

  if (!response.ok) {
    console.error('Discord token exchange failed:', {
      status: response.status,
      body: parsed
    });
    return null;
  }

  return typeof parsed.access_token === 'string' ? parsed.access_token : null;
}

async function fetchDiscordUserProfile(accessToken: string): Promise<DiscordUserProfile | null> {
  const response = await fetch(DISCORD_ME_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const responseText = await response.text();
  let parsed: DiscordUserProfile | Record<string, unknown> = {};

  try {
    parsed = responseText ? JSON.parse(responseText) : {};
  } catch (error) {
    console.error('Discord profile response was not valid JSON:', responseText);
    throw error;
  }

  if (!response.ok) {
    console.error('Discord profile fetch failed:', {
      status: response.status,
      body: parsed
    });
    return null;
  }

  if (typeof parsed.id !== 'string' || typeof parsed.username !== 'string') {
    console.error('Discord profile response missing expected fields:', parsed);
    return null;
  }

  return {
    id: parsed.id,
    username: parsed.username,
    avatar: typeof parsed.avatar === 'string' ? parsed.avatar : null,
    email: typeof parsed.email === 'string' ? parsed.email : undefined
  };
}

router.get('/discord', (_req, res) => {
  if (!hasDiscordAuthEnabled()) {
    return res.redirect(buildRootRedirect({ error: 'discord_auth_disabled' }));
  }

  return res.redirect(buildDiscordAuthorizeUrl());
});

router.get('/discord/callback', async (req, res) => {
  if (!hasDiscordAuthEnabled()) {
    return res.redirect(buildRootRedirect({ error: 'discord_auth_disabled' }));
  }

  if (typeof req.query.error === 'string') {
    console.warn('Discord OAuth callback returned error:', req.query.error);
    return res.redirect(buildRootRedirect({ error: 'discord_auth_failed' }));
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) {
    return res.redirect(buildRootRedirect({ error: 'discord_auth_failed' }));
  }

  try {
    const accessToken = await exchangeDiscordCode(code);
    if (!accessToken) {
      return res.redirect(buildRootRedirect({ error: 'discord_auth_failed' }));
    }

    const user = await fetchDiscordUserProfile(accessToken);
    if (!user) {
      return res.redirect(buildRootRedirect({ error: 'discord_auth_failed' }));
    }

    if (!isDiscordUserAllowed(user.id)) {
      console.warn(
        `Unauthorized Discord login attempt blocked: ${user.username} (ID: ${user.id})`
      );
      return res.redirect(buildRootRedirect({ error: 'discord_not_allowed' }));
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      avatar: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : null,
      isAuthorized: true
    });

    console.log(`Redirecting authorized user ${user.username} to root access page`);
    return res.redirect(buildRootRedirect({ token }));
  } catch (error) {
    console.error('Discord OAuth callback failed:', error);
    return res.redirect(buildRootRedirect({ error: 'discord_auth_failed' }));
  }
});

router.get('/status', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const user = req.user!;

  res.json({
    authenticated: true,
    authorized: user.isAuthorized,
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar
    }
  });
});

router.get('/status-public', (_req, res) => {
  res.json({
    authenticated: false,
    authorized: false,
    user: null
  });
});

router.post('/logout', (req, res) => {
  const finishLogout = () =>
    res.json({
      success: true,
      message: 'Sesion cerrada exitosamente'
    });

  if (typeof req.logout === 'function') {
    req.logout((error) => {
      if (error) {
        console.error('Passport logout failed:', error);
      }

      if (req.session) {
        req.session.destroy(() => finishLogout());
        return;
      }

      finishLogout();
    });
    return;
  }

  finishLogout();
});

router.get('/logout', (_req, res) => {
  res.redirect(buildRootRedirect({ logged_out: 'true' }));
});

router.get('/protected', authenticateJWT, (req: AuthenticatedRequest, res) => {
  const user = req.user!;

  if (!user.isAuthorized) {
    return res.status(403).json({
      success: false,
      message: 'Usuario no autorizado'
    });
  }

  res.json({
    success: true,
    message: 'Acceso autorizado via JWT',
    user
  });
});

export default router;
