import { bookingService } from '../../lib/services/booking.service.js';
import { bookingSchema } from '../../lib/validators/booking.schema.js';
import { handleError } from '../../lib/utils/error.js';
import { withProductionHarden } from '../../lib/logger.js';
import { rateLimit, LIMITS } from '../../lib/rate-limiter.js';

async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, data: null, error: 'Method not allowed' });
  }

  try {
    // 1. Rate Limit
    await rateLimit(req.headers['x-forwarded-for'] || req.socket.remoteAddress, LIMITS.BOOKING);

    // 2. Validate Input
    const validatedData = bookingSchema.parse(req.body);

    // 3. Call Service
    const data = await bookingService.createBooking(validatedData, { requestId: req.requestId });

    // 4. Return Response
    return res.status(200).json({ success: true, data, error: null });
  } catch (error) {
    return handleError(res, error);
  }
}

export default withProductionHarden(handler);
