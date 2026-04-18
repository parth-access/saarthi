import { db } from './_lib/firebase-admin';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { password } = req.query;

  if (password !== 'saarthi-admin') {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!db) {
    return res.status(500).json({ success: false, error: 'Database unavailable' });
  }

  try {
    const snapshot = await db.collection('bookings').orderBy('createdAt', 'desc').get();
    const bookings = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
      };
    });

    return res.status(200).json({ success: true, bookings });
  } catch (error) {
    console.error('Get bookings error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch bookings' });
  }
}
