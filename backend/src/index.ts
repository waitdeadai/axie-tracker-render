import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { vstarScheduler } from './core/vstarScheduler';
import { initializeAuth } from './auth';
import { apiRouter } from './routes/api';
import { axiesRouter } from './routes/axies';
import { paymentsRouter } from './routes/payments';
import { initPaymentDb, closePaymentDb } from './services/paymentDb';
import { startPaymentVerifier, stopPaymentVerifier } from './services/paymentVerifier';

const app = express();
const DEFAULT_DEV_ORIGIN = 'http://localhost:5174';
const DEV_HOSTS = ['127.0.0.1', 'localhost'];

// Render terminates TLS upstream, so secure session cookies need proxy trust.
app.set('trust proxy', 1);

function getAllowedOrigins(): string[] {
  const origins = new Set(config.cors.origins);

  const addOrigin = (value?: string) => {
    if (!value) {
      return;
    }

    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore malformed optional URLs; strict config validation lives elsewhere.
    }
  };

  addOrigin(process.env.FRONTEND_URL);
  addOrigin(process.env.BACKEND_URL);
  addOrigin(process.env.DISCORD_CALLBACK_URL);

  if (process.env.NODE_ENV !== 'production') {
    origins.add(DEFAULT_DEV_ORIGIN);

    for (const host of DEV_HOSTS) {
      origins.add(`http://${host}:${config.port}`);
      origins.add(`https://${host}:${config.port}`);
    }
  }

  return [...origins];
}

app.use(express.json());

const allowedOrigins = getAllowedOrigins();
const corsMiddleware = cors((req, callback) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  const host = typeof req.headers.host === 'string' ? req.headers.host : '';
  const forwardedProtoHeader = req.headers['x-forwarded-proto'];
  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? forwardedProtoHeader[0]
    : forwardedProtoHeader;
  const protocol = typeof forwardedProto === 'string' && forwardedProto
    ? forwardedProto.split(',')[0].trim()
    : 'http';
  const requestOrigin = host ? `${protocol}://${host}` : null;
  const isAllowed =
    !origin ||
    allowedOrigins.includes('*') ||
    allowedOrigins.includes(origin) ||
    origin === requestOrigin;

  callback(isAllowed ? null : new Error('Not allowed by CORS'), {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    maxAge: 86400,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-API-Key']
  });
});

app.use('/api', corsMiddleware);
app.use('/api', (_req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

initializeAuth(app);
app.use('/api', apiRouter);
app.use('/api/axies', axiesRouter);
app.use('/api/payments', paymentsRouter);

const frontendDistPath = path.resolve(process.cwd(), '..', 'frontend', 'dist');
const legacyRootPath = path.resolve(__dirname, 'payment.html');

if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));

  app.get('/', (_req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.sendFile(legacyRootPath);
  });
}

const startServer = () => {
  try {
    console.log('Starting Axie MVP Backend...');
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('Port:', config.port);

    // Initialize payment database
    initPaymentDb();
    console.log('Payment database initialized');

    // Start payment verifier
    startPaymentVerifier();
    console.log('Payment verifier started');

    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);

      vstarScheduler.start();
      console.log('VStar Scheduler started');

      if (process.env.ENABLE_SELF_PING === 'true') {
        const serverUrl = process.env.BACKEND_URL || `http://localhost:${config.port}`;

        setInterval(() => {
          fetch(`${serverUrl}/api/health`)
            .then((response) => {
              if (response.ok) {
                console.log('Self-ping succeeded');
              } else {
                console.warn('Self-ping failed:', response.status);
              }
            })
            .catch((error) => console.error('Self-ping error:', error));
        }, 14 * 60 * 1000);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const gracefulShutdown = () => {
  console.log('\nShutting down gracefully...');
  vstarScheduler.stop();
  stopPaymentVerifier();
  closePaymentDb();
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();
