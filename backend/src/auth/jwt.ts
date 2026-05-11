import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { isDiscordUserAllowed } from './config';

export interface JWTPayload {
  id: string;
  username: string;
  avatar: string | null;
  isAuthorized: boolean;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

const DEFAULT_DEV_JWT_SECRET = 'axie-dev-jwt-secret';

function cleanEnvValue(value?: string): string {
  return (value || '').trim();
}

function getJwtSecret(): string | null {
  return (
    cleanEnvValue(process.env.JWT_SECRET) ||
    cleanEnvValue(process.env.SESSION_SECRET) ||
    (process.env.NODE_ENV === 'production' ? '' : DEFAULT_DEV_JWT_SECRET) ||
    null
  );
}

function requireJwtSecret(): string {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error('JWT_SECRET or SESSION_SECRET must be configured before issuing tokens');
  }
  return secret;
}

const JWT_EXPIRES_IN =
  (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];

export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, requireJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'axie-mvp-backend'
  });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const secret = getJwtSecret();
    if (!secret) {
      return null;
    }

    const decoded = jwt.verify(token, secret) as JWTPayload;
    return {
      ...decoded,
      isAuthorized: decoded.isAuthorized && isDiscordUserAllowed(decoded.id)
    };
  } catch (error) {
    console.error('Invalid JWT:', error instanceof Error ? error.message : error);
    return null;
  }
}

export function authenticateJWT(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      authenticated: false,
      message: 'Token de acceso requerido'
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      authenticated: false,
      message: 'Token invalido o expirado'
    });
  }

  req.user = decoded;
  next();
}

export function requireAuthorization(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({
      authenticated: false,
      message: 'Usuario no autenticado'
    });
  }

  if (!req.user.isAuthorized) {
    return res.status(403).json({
      authenticated: true,
      authorized: false,
      message: 'Usuario no autorizado'
    });
  }

  next();
}
