import { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Validates the admin session or secret key.
 * In a real production app, this would check a JWT or Firebase Auth token.
 * For this refactor, we transition to a server-side verified secret.
 */
export function validateAdminAuth(req: VercelRequest, res: VercelResponse): boolean {
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  const authHeader = req.headers.authorization;

  if (!adminSecret) {
    console.error('❌ ADMIN_SECRET_KEY is not set in environment variables.');
    res.status(500).json({ success: false, error: 'Server authentication misconfigured.' });
    return false;
  }

  // Check Bearer token or custom header
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

  if (token !== adminSecret) {
    res.status(401).json({ success: false, error: 'Unauthorized access.' });
    return false;
  }

  return true;
}
