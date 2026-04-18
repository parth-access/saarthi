import admin, { db } from './_lib/firebase-admin.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { id, status, password } = req.body;

  // Basic security check (keeping it simple as per existing admin access)
  if (password !== 'saarthi-admin') {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!id || !status) {
    return res.status(400).json({ success: false, error: 'Missing id or status' });
  }

  if (!db) {
    return res.status(500).json({ success: false, error: 'Database unavailable' });
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
    console.error('Update booking error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update booking' });
  }
}
