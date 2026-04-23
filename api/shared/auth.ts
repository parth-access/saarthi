import { verifyToken } from '../../lib/auth-utils.js';
import { env } from '../../lib/env.js';

export async function validateAdminAuth(req: any, res: any): Promise<boolean> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

  if (!token) {
    res.status(401).json({ success: false, error: 'Authorization header missing.' });
    return false;
  }

  // 1. Try JWT validation
  const payload = await verifyToken(token);
  if (payload && payload.role === 'admin') {
    req.user = payload;
    return true;
  }

  // 2. Fallback to ADMIN_SECRET_KEY for backward compatibility/deployment
  if (token === env.ADMIN_SECRET_KEY) {
    req.user = { role: 'admin', id: 'legacy-admin' };
    return true;
  }

  res.status(401).json({ success: false, error: 'Unauthorized access.' });
  return false;
}
