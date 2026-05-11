import { Request, Router } from 'express';
import passport from 'passport';
import { generateToken, authenticateJWT, AuthenticatedRequest } from './jwt';
import { hasDiscordAuthEnabled } from './config';

const router = Router();

function buildRootRedirect(params: Record<string, string>): string {
  const search = new URLSearchParams(params).toString();
  return search ? `/?${search}` : '/';
}

router.get('/discord', (req, res, next) => {
  if (!hasDiscordAuthEnabled()) {
    return res.redirect(buildRootRedirect({ error: 'discord_auth_disabled' }));
  }

  passport.authenticate('discord')(req, res, next);
});

router.get('/discord/callback', (req: Request, res, next) => {
  if (!hasDiscordAuthEnabled()) {
    return res.redirect(buildRootRedirect({ error: 'discord_auth_disabled' }));
  }

  passport.authenticate(
    'discord',
    (error: unknown, user: any, info: { code?: string } | undefined) => {
      if (error) {
        console.error('Discord OAuth callback failed:', error);
        return res.redirect(buildRootRedirect({ error: 'discord_auth_failed' }));
      }

      if (!user) {
        const authError = info?.code || 'discord_auth_failed';
        return res.redirect(buildRootRedirect({ error: authError }));
      }

      req.logIn(user, (loginError) => {
        if (loginError) {
          console.error('Passport login session failed:', loginError);
          return res.redirect(buildRootRedirect({ error: 'discord_login_failed' }));
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

          console.log(`Redirecting authorized user ${user.username} to root access page`);
          return res.redirect(buildRootRedirect({ token }));
        } catch (tokenError) {
          console.error('JWT generation failed:', tokenError);
          return res.redirect(buildRootRedirect({ error: 'token_generation_failed' }));
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
