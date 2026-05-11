import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { config } from './config';
import { vstarScheduler } from './core/vstarScheduler';
import { apiRouter } from './routes/api';
import { paymentsRouter } from './routes/payments';
import { initPaymentDb, closePaymentDb } from './services/paymentDb';
import { startPaymentVerifier, stopPaymentVerifier } from './services/paymentVerifier';

const app = express();
const DEFAULT_DEV_ORIGIN = 'http://localhost:5174';

function getAllowedOrigins(): string[] {
  const origins = [...config.cors.origins];

  if (process.env.NODE_ENV !== 'production' && !origins.includes(DEFAULT_DEV_ORIGIN)) {
    origins.push(DEFAULT_DEV_ORIGIN);
  }

  return origins;
}

app.use(express.json());

const allowedOrigins = getAllowedOrigins();
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    maxAge: 86400,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-API-Key']
  })
);

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

app.use('/api', apiRouter);
app.use('/api/payments', paymentsRouter);

// Serve payment page at root
app.get('/', (_req, res) => {
  res.sendFile(__dirname + '/payment.html');
});

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
