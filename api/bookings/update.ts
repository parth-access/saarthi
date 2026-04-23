import { bookingService } from '../../lib/services/booking.service.js';
import { statusUpdateSchema } from '../../lib/validators/booking.schema.js';
import { handleError } from '../../lib/utils/error.js';
import { validateAdminAuth } from '../shared/auth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Auth Check
  if (!validateAdminAuth(req, res)) return;

  try {
    const { id, status } = statusUpdateSchema.parse(req.body);
    const result = await bookingService.updateStatus(id, status);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error);
  }
}
