import { availabilityService } from '../../lib/services/availability.service.js';
import { handleError } from '../../lib/utils/error.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { therapistId, date, time } = req.body;

  if (!therapistId || !date || !time) {
    return res.status(400).json({ success: false, error: 'Missing locking parameters' });
  }

  try {
    const result = await availabilityService.lockSlot(therapistId, date, time);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error);
  }
}
