import { db } from './firebase-admin.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const snapshot = await db.collection('therapists').where('active', '==', true).get();
    const therapists = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({ success: true, therapists });
  } catch (error: any) {
    console.error('❌ Error fetching therapists:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
