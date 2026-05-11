import { Express } from 'express';
import passport from 'passport';
import { configurePassport } from './passport';
import { sessionMiddleware } from './session';
import authRoutes from './routes';
import { getAuthDisableReason, hasDiscordAuthEnabled, validateAuthConfig } from './config';

export function initializeAuth(app: Express): void {
  if (!hasDiscordAuthEnabled()) {
    app.use('/api/auth', authRoutes);
    console.warn(`Discord auth disabled: ${getAuthDisableReason()}`);
    return;
  }

  validateAuthConfig();

  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  configurePassport();
  app.use('/api/auth', authRoutes);

  console.log('Discord allowlist auth enabled');
}
