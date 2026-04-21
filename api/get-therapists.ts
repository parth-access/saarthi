import { db } from './firebase-admin.js';

/**
 * API Handler: Fetch all active therapists
 * Path: /api/get-therapists
 */
export default async function handler(req: any, res: any) {
  // Always set content-type to JSON to prevent HTML hijacking
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  console.log('🔍 [API] Fetching therapists from Firestore...');

  try {
    // Attempt strict boolean query
    let snapshot = await db.collection('therapists')
      .where('active', '==', true)
      .get();

    // Debugging: If empty, check if we have ANY therapists at all
    if (snapshot.empty) {
      console.log('⚠️ [API] No therapists matched active:true. Checking database state...');
      const allSnapshot = await db.collection('therapists').limit(5).get();
      
      if (allSnapshot.empty) {
        console.log('❌ [API] The therapists collection is completely EMPTY.');
      } else {
        console.log(`ℹ️ [API] Found ${allSnapshot.size} documents in therapists collection, but none matched the "active: true" (boolean) filter.`);
        
        // Potential Type Mismatch Fallback: Some users might store "active" as a string "true"
        const stringFallback = await db.collection('therapists')
          .where('active', '==', 'true')
          .get();
        
        if (!stringFallback.empty) {
          console.log(`💡 [API] Type mismatch detected. Found ${stringFallback.size} therapists with active:"true" (string). Supporting this fallback.`);
          snapshot = stringFallback;
        }
      }
    }

    const therapists = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`✅ [API] Success: Returning ${therapists.length} therapists.`);

    return res.status(200).json({ 
      success: true, 
      therapists 
    });
  } catch (error: any) {
    console.error('❌ [API] Error fetching therapists:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve therapist data.',
      details: error.message 
    });
  }
}
