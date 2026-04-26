import { Router } from 'express';
import { db } from '../../api/firebase-admin.js';
import { verifyUser } from '../middleware/auth.js';

const router = Router();

// /api/bookings/get
router.get('/get', verifyUser, async (req: any, res, next) => {
  try {
    const user = req.user;
    const limit = parseInt(req.query.limit as string) || 20;

    let query = db.collection('bookings').orderBy('createdAt', 'desc');

    if (user.role === 'user') {
      // Normal users only see their own bookings
      query = query.where('userId', '==', user.id);
    } else if (user.role === 'therapist') {
      // Therapist logic moved to therapist routes usually, but if needed:
      query = query.where('therapistId', '==', user.id);
    }

    const snapshot = await query.limit(limit).get();
    
    const bookings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate()?.toISOString(),
      updatedAt: doc.data().updatedAt?.toDate()?.toISOString(),
    }));

    res.status(200).json({ success: true, data: { bookings } });
  } catch (error) {
    next(error);
  }
});

// Create booking etc...
router.post('/create', verifyUser, async (req: any, res, next) => {
  // Logic to process the booking goes here...
  // Just porting an example for the user
  res.status(200).json({ success: true, message: 'Booking route placeholder' });
});

export default router;
