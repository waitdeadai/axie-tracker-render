import { Router } from 'express';
import { state } from '../core/state';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { requireAccess } from '../access/middleware';

const router = Router();

// Free live radar is the funnel (win the first comparison vs axie.top's 1 USDC);
// flip GATE_RADAR=true to put even the basic radar behind the paywall.
const radarGate = process.env.GATE_RADAR === 'true' ? [requireAccess] : [];

function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

function getPythonBinary(): string {
  return process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
}

async function runPredictor(args: string[]): Promise<unknown> {
  const scriptPath = resolveMlScriptPath();
  const pythonBin = getPythonBinary();

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let pythonProcess: ReturnType<typeof spawn>;
    try {
      pythonProcess = spawn(pythonBin, [scriptPath, ...args], {
        cwd: process.cwd(),
        env: { ...process.env, DATA_DIR: getDataDir() }
      });
    } catch (error) {
      reject(error);
      return;
    }

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      pythonProcess.kill();
      reject(new Error('Prediction timeout'));
    }, 10000);

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    pythonProcess.on('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      const output = stdout.trim() || stderr.trim();
      if (!output) {
        reject(new Error('Predictor returned no output'));
        return;
      }

      try {
        resolve(JSON.parse(output));
      } catch (error) {
        reject(
          new Error(
            `Failed to parse predictor output: ${output.slice(0, 240)}`
          )
        );
      }
    });
  });
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

// GET /api/active-players — free radar funnel (gate with GATE_RADAR=true)
router.get('/active-players', ...radarGate, (_req, res) => {
  const players = state.getSnapshot();
  res.json({ updatedAt: new Date().toISOString(), players });
});

// GET /api/predictions/:userId — PAID (predicted sessions = premium)
router.get('/predictions/:userId', requireAccess, async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await runPredictor([userId]);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Prediction request failed';
    const status = message === 'Prediction timeout' ? 408 : 503;
    res.status(status).json({
      error: message,
      user_id: userId,
      predictions: []
    });
  }
});

// GET /api/sessions/:userId — PAID (session-pattern summary = premium)
router.get('/sessions/:userId', requireAccess, async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await runPredictor([userId, 'summary']);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Session request failed';
    const status = message === 'Prediction timeout' ? 408 : 503;
    res.status(status).json({
      error: message,
      user_id: userId,
      summary: null
    });
  }
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
