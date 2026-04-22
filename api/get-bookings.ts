import { db } from './firebase-admin.js';
import { validateAdminAuth } from './_auth.js';

export default async function handler(req: any, res: any) {
  // Enforce JSON content type
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Protect the route
  if (!validateAdminAuth(req, res)) return;

  try {
    const snapshot = await db.collection('bookings')
      .orderBy('createdAt', 'desc')
      .get();

    const bookings = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // Safe timestamp conversion
      let createdAt = data.createdAt;
      if (createdAt && typeof createdAt.toDate === 'function') {
        createdAt = createdAt.toDate().toISOString();
      } else if (createdAt && createdAt._seconds) {
        // Handle admin raw timestamp object
        createdAt = new Date(createdAt._seconds * 1000).toISOString();
      }

      return {
        id: doc.id,
        ...data,
        createdAt
      };
    });

    return res.status(200).json({ success: true, bookings });
  } catch (error: any) {
    console.error('❌ Error fetching bookings:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
