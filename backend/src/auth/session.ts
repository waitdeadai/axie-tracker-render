import session from 'express-session';
import { authConfig } from './config';

export const sessionMiddleware = session({
  secret: authConfig.session.secret,
  resave: authConfig.session.resave,
  saveUninitialized: authConfig.session.saveUninitialized,
  cookie: {
    ...authConfig.session.cookie,
    sameSite: 'lax',
    secure:
      process.env.NODE_ENV === 'production'
        ? true
        : authConfig.session.cookie.secure,
    httpOnly: true
  }
});

export function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }

  res.status(401).json({
    authenticated: false,
    message: 'Usuario no autenticado'
  });
}

export function isAuthorized(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({
      authenticated: false,
      message: 'Usuario no autenticado'
    });
  }

  if (req.user?.isAuthorized) {
    return next();
  }

  return res.status(403).json({
    authenticated: true,
    authorized: false,
    message: 'Usuario no autorizado'
  });
}
