import { Router, Request, Response, NextFunction } from 'express';
import { sendBookingReceivedEmail, sendBookingConfirmedEmail } from '../services/email.service';
import { validateEmailPayload } from '../utils/validators';

const router = Router();

router.post('/booking-received', async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('[EMAIL ROUTE] POST /api/email/booking-received payload:', req.body);
    
    const { valid, error, booking, therapist } = validateEmailPayload(req.body);
    
    if (!valid) {
      return res.status(400).json({ error });
    }

    const therapistName = therapist?.name || 'our therapist';

    const result = await sendBookingReceivedEmail(booking, therapistName);

    if (result.success) {
      return res.json({ success: true, simulated: result.simulated });
    } else {
      console.error('[EMAIL ROUTE] Failed to send booking received email:', result.error);
      return res.status(500).json({ error: result.error });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/booking-confirmed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('[EMAIL ROUTE] POST /api/email/booking-confirmed payload:', req.body);
    
    const { valid, error, booking, therapist } = validateEmailPayload(req.body);

    if (!valid) {
      return res.status(400).json({ error });
    }

    const therapistName = therapist?.name || 'our therapist';
    const therapistEmail = therapist?.email;

    const result = await sendBookingConfirmedEmail(booking, therapistName, therapistEmail);

    if (result.success) {
      return res.json({ success: true, simulated: result.simulated });
    } else {
      console.error('[EMAIL ROUTE] Failed to send booking confirmed email:', result.error);
      return res.status(500).json({ error: result.error });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
