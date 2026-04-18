import { db } from './_lib/firebase-admin.js';

export default async function handler(req: any, res: any) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const snapshot = await db.collection('bookings')
      .orderBy('createdAt', 'desc')
      .get();

    const bookings = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null
      };
    });

    return res.status(200).json({ success: true, bookings });
  } catch (error: any) {
    console.error('❌ Error fetching bookings:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
