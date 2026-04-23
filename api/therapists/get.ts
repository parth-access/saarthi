import { db } from '../firebase-admin.js';
import { handleError } from '../../lib/utils/error.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const snapshot = await db.collection('therapists').get();
    const therapists = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({ success: true, therapists });
  } catch (error) {
    return handleError(res, error);
  }
}
