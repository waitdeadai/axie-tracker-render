import { Router, Request, Response } from 'express';
import { createSession, getSession, validateApiKey } from '../services/paymentDb';
import { config } from '../config';

const router = Router();

// Plan definitions matching SPEC
const PLANS = {
  '2weeks': { usdc: 2, ron: 20, days: 14 },
  '1month': { usdc: 5, ron: 50, days: 30 },
  '3month': { usdc: 12, ron: 120, days: 90 },
  '1year': { usdc: 40, ron: 400, days: 365 }
} as const;

const USDC_DECIMALS = 6;
const RON_DECIMALS = 18;

// POST /api/payments/create — creates session, returns amount + address
router.post('/create', (req: Request, res: Response): void => {
  try {
    const { plan, token, userAddress } = req.body as {
      plan?: string;
      token?: string;
      userAddress?: string;
    };

    if (!plan || !PLANS[plan as keyof typeof PLANS]) {
      res.status(400).json({ error: 'Invalid or missing plan. Valid plans: 2weeks, 1month, 3month, 1year' });
      return;
    }

    if (!token || (token !== 'USDC' && token !== 'RON')) {
      res.status(400).json({ error: 'Invalid or missing token. Valid tokens: USDC, RON' });
      return;
    }

    if (!userAddress || !userAddress.startsWith('ronin:')) {
      res.status(400).json({ error: 'Invalid or missing userAddress. Must be a Ronin address (ronin:...)' });
      return;
    }

    const planKey = plan as keyof typeof PLANS;
    const planData = PLANS[planKey];

    let amount: string;
    if (token === 'USDC') {
      amount = (planData.usdc * Math.pow(10, USDC_DECIMALS)).toFixed(0);
    } else {
      amount = (planData.ron * Math.pow(10, RON_DECIMALS)).toFixed(0);
    }

    const sessionId = createSession(userAddress, plan, token, amount);
    const expiresAt = Date.now() + 15 * 60 * 1000;

    res.json({
      sessionId,
      amount,
      token,
      tokenAddress: token === 'USDC' ? config.payment.usdcContract : null,
      expiresAt,
      paymentAddress: config.payment.paymentWalletAddress
    });
  } catch (error) {
    console.error('[Payments] Error creating session:', error);
    res.status(500).json({ error: 'Failed to create payment session' });
  }
});

// GET /api/payments/:sessionId/status — returns status + apiKey if confirmed
router.get('/:sessionId/status', (req: Request, res: Response): void => {
  try {
    const { sessionId } = req.params;

    const session = getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const response: {
      status: string;
      plan?: string;
      apiKey?: string;
      expiresAt?: number;
    } = {
      status: session.status,
      plan: session.plan
    };

    if (session.status === 'confirmed') {
      response.expiresAt = session.expires_at;
      // Return the plaintext API key stored in the session
      if (session.api_key) {
        response.apiKey = session.api_key;
      }
    }

    res.json(response);
  } catch (error) {
    console.error('[Payments] Error getting session status:', error);
    res.status(500).json({ error: 'Failed to get session status' });
  }
});

// GET /api/payments/rates — returns plan prices
router.get('/rates', (_req: Request, res: Response): void => {
  res.json({
    plans: [
      { id: '2weeks', usdc: 2, ron: 20, days: 14 },
      { id: '1month', usdc: 5, ron: 50, days: 30 },
      { id: '3month', usdc: 12, ron: 120, days: 90 },
      { id: '1year', usdc: 40, ron: 400, days: 365 }
    ],
    tokens: {
      USDC: { address: config.payment.usdcContract, decimals: USDC_DECIMALS },
      RON: { decimals: RON_DECIMALS }
    }
  });
});

export { router as paymentsRouter };
