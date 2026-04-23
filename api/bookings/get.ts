import { db } from '../firebase-admin.js';
import { handleError } from '../../lib/utils/error.js';
import { validateAdminAuth } from '../shared/auth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!validateAdminAuth(req, res)) return;

  try {
    const snapshot = await db.collection('bookings')
      .orderBy('createdAt', 'desc')
      .get();
    
    const bookings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate()?.toISOString(),
      updatedAt: doc.data().updatedAt?.toDate()?.toISOString(),
    }));

    return res.status(200).json({ success: true, bookings });
  } catch (error) {
    return handleError(res, error);
  }
}
