import { db } from '../firebase-admin.js';
import { handleError } from '../../lib/utils/error.js';
import { validateAdminAuth } from '../../backend/middleware/auth.js';
import { withProductionHarden } from '../../lib/logger.js';
import admin from 'firebase-admin';

async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, data: null, error: 'Method not allowed' });
  }

  if (!await validateAdminAuth(req, res)) return;

  const limit = parseInt(req.query.limit as string) || 20;
  const cursor = req.query.cursor as string; // Standardized as ISO date or timestamp

  try {
    let query = db.collection('bookings')
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!isNaN(cursorDate.getTime())) {
        query = query.startAfter(admin.firestore.Timestamp.fromDate(cursorDate));
      }
    }

    const snapshot = await query.get();
    
    const bookings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate()?.toISOString(),
      updatedAt: doc.data().updatedAt?.toDate()?.toISOString(),
    }));

    // Generate next cursor
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const nextCursor = lastDoc ? lastDoc.data().createdAt?.toDate()?.toISOString() : null;

    return res.status(200).json({ 
      success: true, 
      data: {
        bookings,
        nextCursor,
        hasMore: bookings.length === limit
      }, 
      error: null 
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export default withProductionHarden(handler);
