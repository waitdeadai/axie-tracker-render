import { Router } from 'express';
import passport from 'passport';
import { generateToken, authenticateJWT, AuthenticatedRequest } from './jwt';

const router = Router();

function getFrontendUrl(): URL {
  const configuredUrl = process.env.FRONTEND_URL?.trim() || 'http://localhost:5174/';
  const frontendUrl = new URL(configuredUrl);

  if (!frontendUrl.pathname.endsWith('/')) {
    frontendUrl.pathname = `${frontendUrl.pathname}/`;
  }

  frontendUrl.search = '';
  frontendUrl.hash = '';
  return frontendUrl;
}

function buildFrontendRedirect(params: Record<string, string>): string {
  const frontendUrl = getFrontendUrl();

  for (const [key, value] of Object.entries(params)) {
    frontendUrl.searchParams.set(key, value);
  }

  return frontendUrl.toString();
}

router.get('/discord', passport.authenticate('discord'));

router.get('/discord/callback', (req, res, next) => {
  passport.authenticate(
    'discord',
    (error: unknown, user: any, info: { code?: string } | undefined) => {
      if (error) {
        console.error('Discord OAuth callback failed:', error);
        return res.redirect(buildFrontendRedirect({ error: 'discord_auth_failed' }));
      }

      if (!user) {
        const authError = info?.code || 'discord_auth_failed';
        return res.redirect(buildFrontendRedirect({ error: authError }));
      }

      req.logIn(user, (loginError) => {
        if (loginError) {
          console.error('Passport login session failed:', loginError);
          return res.redirect(buildFrontendRedirect({ error: 'discord_login_failed' }));
        }

        try {
          const token = generateToken({
            id: user.id,
            username: user.username,
            avatar: user.avatar
              ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
              : null,
            isAuthorized: Boolean(user.isAuthorized)
          });

          console.log(`Redirecting authorized user ${user.username} to frontend`);
          return res.redirect(buildFrontendRedirect({ token }));
        } catch (tokenError) {
          console.error('JWT generation failed:', tokenError);
          return res.redirect(buildFrontendRedirect({ error: 'token_generation_failed' }));
        }
      });
    }
  )(req, res, next);
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

router.get('/failed', (_req, res) => {
  res.status(401).json({
    success: false,
    message: 'Fallo la autenticacion con Discord'
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
  res.redirect(buildFrontendRedirect({ logged_out: 'true' }));
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
