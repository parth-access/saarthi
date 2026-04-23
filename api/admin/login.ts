import { createToken } from '../../lib/auth-utils.js';
import { env } from '../../lib/env.js';
import { withProductionHarden } from '../../lib/logger.js';
import { rateLimit, LIMITS } from '../../lib/rate-limiter.js';

async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, data: null, error: 'Method not allowed' });
  }

  const { secret } = req.body;

  try {
    // Rate limit login attempts
    await rateLimit(req.headers['x-forwarded-for'] || req.socket.remoteAddress, { maxRequests: 5, windowMs: 15 * 60 * 1000 });

    if (secret !== env.ADMIN_SECRET_KEY) {
      return res.status(401).json({ success: false, data: null, error: 'Invalid secret key' });
    }

    // Issue JWT for admin
    const token = await createToken({ 
      userId: 'admin-1', 
      role: 'admin',
      displayName: 'Saarthi Administrator'
    });

    return res.status(200).json({ 
      success: true, 
      data: { token }, 
      error: null 
    });
  } catch (error: any) {
    if (error.statusCode === 429) {
       return res.status(429).json({ success: false, data: null, error: 'Too many attempts. Please wait.' });
    }
    return res.status(500).json({ success: false, data: null, error: 'Internal server error' });
  }
}

export default withProductionHarden(handler);
