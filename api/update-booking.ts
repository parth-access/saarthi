import admin, { db } from './_lib/firebase-admin';

export default async function handler(req: any, res: any) {
  // Always return JSON
  const sendError = (status: number, message: string) => {
    return res.status(status).json({ success: false, error: message });
  };

  try {
    if (req.method !== 'POST') {
      return sendError(405, 'Method not allowed');
    }

    const { id, status, password } = req.body;
    console.log("📝 Update Booking API Hit:", { id, status });

    if (password !== 'saarthi-admin') {
      return sendError(401, 'Unauthorized');
    }

    if (!id || !status) {
      return sendError(400, 'Missing id or status');
    }

    // Database check
    if (!db) {
      console.error("🔥 Database instance missing in update-booking");
      return sendError(500, 'Database initialization failed');
    }

    try {
      const bookingRef = db.collection('bookings').doc(id);
      await bookingRef.update({ 
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Booking ${id} updated to ${status}`);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('❌ Update booking error:', error);
      return sendError(500, 'Failed to update booking in database');
    }
  } catch (fatalError) {
    console.error('💀 FATAL UPDATE API ERROR:', fatalError);
    return sendError(500, 'Internal server error');
  }
}
