import { db } from '../firebase-admin.js';
import admin from 'firebase-admin';
import { AppError } from '../../lib/utils/error.js';
import { verifyToken } from '../../lib/auth-utils.js';
import { env } from '../../lib/env.js';

export async function verifyUser(req: any) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

  if (!token) {
    throw new AppError('Unauthorized: No token provided', 401);
  }

  // 1. Try Firebase ID Token (Primary Source)
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    
    if (!userDoc.exists) {
      throw new AppError('User not found in system', 404);
    }

    const userData = userDoc.data();
    req.user = {
      id: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name || userData?.name,
      role: userData?.role || 'user',
    };
    return req.user;
  } catch (error: any) {
    // If it's a "User not found" error, re-throw it
    if (error instanceof AppError) throw error;
    
    // Otherwise, Firebase verification failed, try fallbacks if they aren't expired or clearly malicious
  }

  // 2. Try JWT fallback (Optional)
  try {
    const payload = await verifyToken(token);
    if (payload) {
      req.user = {
        id: payload.id || payload.sub,
        email: payload.email,
        role: payload.role || 'user',
        name: payload.name
      };
      return req.user;
    }
  } catch (err) {
    // Continue
  }

  // 3. Fallback to ADMIN_SECRET_KEY (For CLI or internal tools)
  if (token === env.ADMIN_SECRET_KEY) {
    req.user = { id: 'system-admin', role: 'admin', name: 'System Administrator' };
    return req.user;
  }

  throw new AppError('Unauthorized: Invalid or expired token', 401);
}

export async function requireRole(req: any, roles: string[]) {
  const user = await verifyUser(req);
  if (!roles.includes(user.role)) {
    throw new AppError('Forbidden: Insufficient permissions', 403);
  }
  return user;
}

export const requireAdmin = (req: any) => requireRole(req, ['admin']);
export const requireTherapist = (req: any) => requireRole(req, ['admin', 'therapist']);
