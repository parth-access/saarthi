import { db } from './_lib/firebase-admin';

export default async function handler(req: any, res: any) {
  console.log("🔥 API HIT:", req.url);
  
  // Always return JSON
  const sendError = (status: number, message: string) => {
    return res.status(status).json({ success: false, error: message });
  };

  try {
    if (req.method !== 'GET') {
      return sendError(405, 'Method not allowed');
    }

    const { password } = req.query;
    console.log("🔍 Admin Fetch Attempt");

    if (password !== 'saarthi-admin') {
      return sendError(401, 'Unauthorized');
    }

    // Database check
    if (!db) {
      console.error("🔥 Database instance missing in get-bookings");
      return sendError(500, 'Database initialization failed');
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

      console.log(`✅ Successfully fetched ${bookings.length} bookings`);
      return res.status(200).json({ success: true, bookings });
    } catch (error) {
      console.error('❌ Firestore Fetch Error:', error);
      return sendError(500, 'Failed to fetch bookings from database');
    }
  } catch (fatalError) {
    console.error('💀 FATAL ADMIN API ERROR:', fatalError);
    return sendError(500, 'Internal server error');
  }
}
