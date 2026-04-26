import { verifyUser } from './auth-middleware.js';

export async function validateAdminAuth(req: any, res: any): Promise<boolean> {
  try {
    const user = await verifyUser(req);
    if (user.role === 'admin') {
      return true;
    }
    res.status(403).json({ success: false, error: 'Forbidden: Admin access required.' });
    return false;
  } catch (error: any) {
    res.status(error.status || 401).json({ success: false, error: error.message });
    return false;
  }
}

export async function validateTherapistAuth(req: any, res: any): Promise<boolean> {
  try {
    const user = await verifyUser(req);
    if (user.role === 'therapist' || user.role === 'admin') {
      return true;
    }
    res.status(403).json({ success: false, error: 'Forbidden: Therapist access required.' });
    return false;
  } catch (error: any) {
    res.status(error.status || 401).json({ success: false, error: error.message });
    return false;
  }
}
