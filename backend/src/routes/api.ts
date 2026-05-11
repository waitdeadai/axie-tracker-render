import { Router } from 'express';
import { state } from '../core/state';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

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

// GET /api/leaderboard — public
router.get('/leaderboard', (_req, res) => {
  const players = state.getAllPlayers();
  res.json(players);
});

// GET /api/active-players — public
router.get('/active-players', (_req, res) => {
  const players = state.getSnapshot();
  res.json({ updatedAt: new Date().toISOString(), players });
});

// GET /api/predictions/:userId — public
router.get('/predictions/:userId', async (req, res) => {
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

// GET /api/sessions/:userId — public
router.get('/sessions/:userId', async (req, res) => {
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
