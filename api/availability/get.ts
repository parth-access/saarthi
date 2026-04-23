import { availabilityService } from '../../lib/services/availability.service.js';
import { handleError } from '../../lib/utils/error.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { therapistId, date } = req.query;

  if (!therapistId || !date) {
    return res.status(400).json({ success: false, error: 'Therapist ID and Date are required' });
  }

  try {
    const slots = await availabilityService.getAvailability(therapistId as string, date as string);
    return res.status(200).json({ success: true, slots });
  } catch (error) {
    return handleError(res, error);
  }
}
