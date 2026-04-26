import { Router } from 'express';
import { db } from '../../api/firebase-admin.js';
import { verifyUser, requireTherapist, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(verifyUser);
router.use(requireTherapist);

router.get('/bookings', async (req: AuthRequest, res, next) => {
  try {
    const user = req.user;
    const limit = parseInt(req.query.limit as string) || 50;

    let query = db.collection('bookings').orderBy('createdAt', 'desc');

    if (user.role === 'therapist') {
      query = query.where('therapistId', '==', user.id);
    } else if (user.role === 'admin' && req.query.therapistId) {
      query = query.where('therapistId', '==', req.query.therapistId);
    }

    const snapshot = await query.limit(limit).get();
    
    const bookings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate()?.toISOString(),
      updatedAt: doc.data().updatedAt?.toDate()?.toISOString(),
    }));

    res.status(200).json({ 
      success: true, 
      data: { 
        bookings,
        count: bookings.length,
        isFiltered: user.role === 'therapist'
      } 
    });
  } catch (error) {
    next(error);
  }
});

export default router;
