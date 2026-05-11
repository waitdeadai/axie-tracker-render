import { Router } from 'express';
import { state } from '../core/state';
import { scheduler } from '../core/scheduler';

const router: Router = Router();

router.get('/active', (_req, res) => {
  try {
    const players = state.getSnapshot();
    const stats = scheduler.getRuntimeStats();

    res.json({
      updatedAt: new Date().toISOString(),
      rps: Math.round(stats.rps * 100) / 100,
      etaSeconds: Math.round(stats.etaSeconds * 100) / 100,
      players,
      topRange: scheduler.getTopRange()
    });
  } catch (error) {
    console.error('Error in /active route:', error);
    res.status(500).json({
      error: 'Internal server error',
      updatedAt: new Date().toISOString(),
      rps: 0,
      etaSeconds: 0,
      players: [],
      topRange: 'top200'
    });
  }
});

router.post('/set-range', async (req, res) => {
  try {
    const { range } = req.body;

    if (!range || !['top200', 'top300'].includes(range)) {
      return res.status(400).json({
        error: 'Invalid range. Must be "top200" or "top300"'
      });
    }

    await scheduler.setTopRange(range);

    res.json({
      success: true,
      topRange: range,
      message: `Successfully switched to ${range}`
    });
  } catch (error) {
    console.error('Error setting range:', error);
    res.status(500).json({
      error: 'Failed to change range',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/range-info', (_req, res) => {
  try {
    const stats = scheduler.getRuntimeStats();
    const topRange = scheduler.getTopRange();

    res.json({
      topRange,
      hotQueueSize: stats.hotQueueSize,
      coldQueueSize: stats.coldQueueSize,
      totalPlayers: stats.hotQueueSize + stats.coldQueueSize,
      rps: Math.round(stats.rps * 100) / 100,
      etaSeconds: Math.round(stats.etaSeconds * 100) / 100
    });
  } catch (error) {
    console.error('Error getting range info:', error);
    res.status(500).json({
      error: 'Failed to get range info',
      topRange: 'top200'
    });
  }
});

export default router;
