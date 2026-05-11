import { Router, Request, Response, NextFunction } from 'express';
import { state } from '../core/state';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { validateApiKey } from '../services/paymentDb';

const router = Router();

function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

// GET /api/health — public, no auth
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    playersTracked: state.getAllPlayers().length
  });
});

// X-API-Key auth middleware using paymentDb
function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'] as string | undefined;

  if (!key) {
    res.status(401).json({ error: 'Missing X-API-Key header' });
    return;
  }

  if (process.env.API_KEY && key === process.env.API_KEY) {
    (req as Request & { apiKeyInfo?: { userAddress: string; plan: string; expiresAt: number } }).apiKeyInfo = {
      userAddress: 'static-api-key',
      plan: 'manual',
      expiresAt: Number.MAX_SAFE_INTEGER
    };
    next();
    return;
  }

  const validation = validateApiKey(key);

  if (!validation || !validation.valid) {
    res.status(401).json({ error: 'Invalid or expired API key' });
    return;
  }

  // Attach validated key info to request for downstream use
  (req as Request & { apiKeyInfo?: { userAddress: string; plan: string; expiresAt: number } }).apiKeyInfo = {
    userAddress: validation.userAddress,
    plan: validation.plan,
    expiresAt: validation.expiresAt
  };

  next();
}

// GET /api/leaderboard — requires auth
router.get('/leaderboard', apiKeyAuth, (_req, res) => {
  const players = state.getAllPlayers();
  res.json(players);
});

// GET /api/active-players — requires auth
router.get('/active-players', apiKeyAuth, (_req, res) => {
  const players = state.getSnapshot();
  res.json({ updatedAt: new Date().toISOString(), players });
});

// GET /api/predictions/:userId — requires auth
router.get('/predictions/:userId', apiKeyAuth, async (req, res) => {
  const { userId } = req.params;
  const scriptPath = resolveMlScriptPath();
  const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

  const pythonProcess = spawn(PYTHON_BIN, [scriptPath, userId], {
    cwd: process.cwd(),
    env: { ...process.env, DATA_DIR: getDataDir() }
  });

  let dataString = '';
  pythonProcess.stdout.on('data', (data) => { dataString += data.toString(); });

  pythonProcess.on('close', (code) => {
    if (code === 0) {
      try {
        const result = JSON.parse(dataString);
        res.json(result);
      } catch {
        res.status(500).json({ error: 'Failed to parse prediction' });
      }
    } else {
      res.status(404).json({ error: 'No prediction data found' });
    }
  });

  setTimeout(() => { pythonProcess.kill(); res.status(408).json({ error: 'Prediction timeout' }); }, 10000);
});

// GET /api/sessions/:userId — requires auth
router.get('/sessions/:userId', apiKeyAuth, async (req, res) => {
  const { userId } = req.params;
  const scriptPath = resolveMlScriptPath();
  const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

  const pythonProcess = spawn(PYTHON_BIN, [scriptPath, userId, 'summary'], {
    cwd: process.cwd(),
    env: { ...process.env, DATA_DIR: getDataDir() }
  });

  let dataString = '';
  pythonProcess.stdout.on('data', (data) => { dataString += data.toString(); });

  pythonProcess.on('close', (code) => {
    if (code === 0) {
      try {
        const result = JSON.parse(dataString);
        res.json(result);
      } catch {
        res.status(500).json({ error: 'Failed to parse session data' });
      }
    } else {
      res.status(404).json({ error: 'No session data found' });
    }
  });
});

function resolveMlScriptPath(): string {
  const candidates = [
    path.resolve(__dirname, 'ml', 'simple_predictor.py'),
    path.resolve(process.cwd(), 'src', 'ml', 'simple_predictor.py'),
    path.resolve(process.cwd(), 'backend', 'src', 'ml', 'simple_predictor.py')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`ML predictor script not found`);
}

export { router as apiRouter };
