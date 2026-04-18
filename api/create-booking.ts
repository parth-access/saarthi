import { db } from './_lib/firebase-admin.js';

export default async function handler(req: any, res: any) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { name, email, message } = req.body;

  // Basic validation
  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const bookingData = {
      name,
      email,
      message,
      status: 'pending',
      createdAt: new Date()
    };

    const docRef = await db.collection('bookings').add(bookingData);
    console.log('💾 Booking created with ID:', docRef.id);

    return res.status(200).json({ success: true, id: docRef.id });
  } catch (error: any) {
    console.error('❌ Error creating booking:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
