import { bookingService } from '../../lib/services/booking.service.js';
import { bookingSchema } from '../../lib/validators/booking.schema.js';
import { handleError } from '../../lib/utils/error.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // 1. Validate Input
    const validatedData = bookingSchema.parse(req.body);

    // 2. Call Service
    const result = await bookingService.createBooking(validatedData);

    // 3. Return Response
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error);
  }
}
