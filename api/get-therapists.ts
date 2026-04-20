import { db } from './firebase-admin.js';

/**
 * API Handler: Fetch all active therapists
 * Path: /api/get-therapists
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  console.log('🔍 Fetching therapists from Firestore...');

  try {
    const snapshot = await db.collection('therapists')
      .where('active', '==', true)
      .get();

    if (snapshot.empty) {
      console.log('⚠️ No active therapists found in database.');
      return res.status(200).json({ success: true, therapists: [] });
    }

    const therapists = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`✅ Successfully fetched ${therapists.length} therapists.`);
    
    // Add artificial delay for testing loading states if needed
    await new Promise(resolve => setTimeout(resolve, 1000));

    return res.status(200).json({ 
      success: true, 
      therapists 
    });
  } catch (error: any) {
    console.error('❌ Error fetching therapists:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve therapist data. Please try again later.',
      details: error.message 
    });
  }
}
