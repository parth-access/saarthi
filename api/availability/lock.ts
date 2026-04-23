import { availabilityService } from '../../lib/services/availability.service.js';
import { handleError } from '../../lib/utils/error.js';
import { withProductionHarden } from '../../lib/logger.js';
import { rateLimit, LIMITS } from '../../lib/rate-limiter.js';

async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, data: null, error: 'Method not allowed' });
  }

  const { therapistId, date, time } = req.body;

  if (!therapistId || !date || !time) {
    return res.status(400).json({ success: false, data: null, error: 'Missing locking parameters' });
  }

  try {
    // Rate Limit
    await rateLimit(req.headers['x-forwarded-for'] || req.socket.remoteAddress, LIMITS.LOCK);

    const data = await availabilityService.lockSlot(therapistId, date, time, { requestId: req.requestId });
    return res.status(200).json({ success: true, data, error: null });
  } catch (error: any) {
    return handleError(res, error);
  }
}

export default withProductionHarden(handler);
