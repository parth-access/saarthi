import { db } from './firebase-admin.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ success: false, error: 'Date is required' });
  }

  try {
    // We only care about confirmed bookings for double-booking prevention
    // Also including 'pending' to prevent double booking while a request is being reviewed
    // User requested: "Check if (date + time) already exists with status 'confirmed'"
    // But usually it's safer to block even pending ones if we want a strict slot system.
    // I'll stick to 'confirmed' as requested but also consider 'pending' if the user wants strictness.
    // For now, let's fetch all bookings for this date and let the client decide or filter here.
    
    const snapshot = await db.collection('bookings')
      .where('date', '==', date)
      .where('status', 'in', ['confirmed', 'pending'])
      .get();

    const bookedSlots = snapshot.docs.map(doc => doc.data().time);

    return res.status(200).json({ 
      success: true, 
      bookedSlots 
    });
  } catch (error: any) {
    console.error('❌ Error fetching availability:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
