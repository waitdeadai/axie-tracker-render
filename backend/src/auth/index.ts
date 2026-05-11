import { Express } from 'express';
import passport from 'passport';
import { configurePassport } from './passport';
import { sessionMiddleware } from './session';
import authRoutes from './routes';
import { validateAuthConfig } from './config';

// Función para inicializar toda la autenticación
export function initializeAuth(app: Express): void {
  // Validar configuración
  validateAuthConfig();
  
  // Configurar middleware de sesión
  app.use(sessionMiddleware);
  
  // Inicializar passport
  app.use(passport.initialize());
  app.use(passport.session());
  
  // Configurar estrategia de passport
  configurePassport();
  
  // Montar rutas de autenticación
  app.use('/api/auth', authRoutes);
  
  console.log('✅ Authentication initialized');
}
