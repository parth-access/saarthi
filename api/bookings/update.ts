import { bookingService } from '../../lib/services/booking.service.js';
import { statusUpdateSchema } from '../../lib/validators/booking.schema.js';
import { handleError } from '../../lib/utils/error.js';
import { validateAdminAuth } from '../shared/auth.js';
import { withProductionHarden } from '../../lib/logger.js';

async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, data: null, error: 'Method not allowed' });
  }

  // Auth Check
  if (!await validateAdminAuth(req, res)) return;

  try {
    const { id, status } = statusUpdateSchema.parse(req.body);
    const data = await bookingService.updateStatus(id, status, { requestId: req.requestId });
    
    return res.status(200).json({ 
      success: true, 
      data, 
      error: null 
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export default withProductionHarden(handler);
