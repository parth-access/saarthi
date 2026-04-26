import { handleError } from '../../lib/utils/error.js';
import { verifyUser } from '../shared/auth-middleware.js';
import { withProductionHarden } from '../../lib/logger.js';

async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const user = await verifyUser(req);
    
    return res.status(200).json({ 
      success: true, 
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      } 
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export default withProductionHarden(handler);
