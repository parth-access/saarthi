import { db } from '../firebase-admin.js';
import { handleError } from '../../lib/utils/error.js';
import { withProductionHarden } from '../../lib/logger.js';

async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, data: null, error: 'Method not allowed' });
  }

  try {
    const snapshot = await db.collection('therapists').get();
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({ success: true, data, error: null });
  } catch (error) {
    return handleError(res, error);
  }
}

export default withProductionHarden(handler);
