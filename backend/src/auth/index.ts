import { Express } from 'express';
import authRoutes from './routes';
import { getAuthDisableReason, hasDiscordAuthEnabled, validateAuthConfig } from './config';

export function initializeAuth(app: Express): void {
  if (!hasDiscordAuthEnabled()) {
    app.use('/api/auth', authRoutes);
    console.warn(`Discord auth disabled: ${getAuthDisableReason()}`);
    return;
  }

  validateAuthConfig();
  app.use('/api/auth', authRoutes);

  console.log('Discord allowlist auth enabled');
}
