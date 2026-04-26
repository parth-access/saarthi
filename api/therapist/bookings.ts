import { db } from '../firebase-admin.js';
import { handleError } from '../../lib/utils/error.js';
import { requireTherapist } from '../shared/auth-middleware.js';
import { withProductionHarden } from '../../lib/logger.js';

async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, data: null, error: 'Method not allowed' });
  }

  try {
    const user = await requireTherapist(req);
    const limit = parseInt(req.query.limit as string) || 50;

    let query = db.collection('bookings')
      .orderBy('createdAt', 'desc');

    // STRICT ISOLATION: 
    // If therapist, they ONLY see their own bookings.
    // If admin, they can see all or filter.
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

    return res.status(200).json({ 
      success: true, 
      data: { 
        bookings,
        count: bookings.length,
        isFiltered: user.role === 'therapist'
      }, 
      error: null 
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export default withProductionHarden(handler);
