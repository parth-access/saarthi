import { db } from '../firebase-admin.js';
import { handleError } from '../../lib/utils/error.js';
import { validateAdminAuth } from '../shared/auth.js';
import { withProductionHarden } from '../../lib/logger.js';

async function handler(req: any, res: any) {
  if (!await validateAdminAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const { therapistId } = req.query;
      let query: any = db.collection('availability_rules');
      if (therapistId) query = query.where('therapistId', '==', therapistId);
      
      const snapshot = await query.get();
      const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json({ success: true, data, error: null });
    }

    if (req.method === 'POST') {
      const rule = req.body;
      // Basic validation
      if (!rule.therapistId || rule.dayOfWeek === undefined || !rule.startTime || !rule.endTime) {
        return res.status(400).json({ success: false, data: null, error: 'Missing rule parameters' });
      }

      const docRef = await db.collection('availability_rules').add({
        ...rule,
        createdAt: new Date()
      });
      return res.status(200).json({ success: true, data: { id: docRef.id }, error: null });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, data: null, error: 'Rule ID required' });
      await db.collection('availability_rules').doc(id as string).delete();
      return res.status(200).json({ success: true, data: { id }, error: null });
    }

    return res.status(405).json({ success: false, data: null, error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}

export default withProductionHarden(handler);
