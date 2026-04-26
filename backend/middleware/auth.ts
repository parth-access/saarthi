import { NextFunction, Request, Response } from 'express';
import admin from 'firebase-admin';
import { db } from '../../api/firebase-admin.js'; // Assuming we're re-using existing initialization
import { AppError } from '../../lib/utils/error.js';
import { verifyToken } from '../../lib/auth-utils.js';
import { env } from '../../lib/env.js';

export interface AuthRequest extends Request {
  user?: any;
}

export async function verifyUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

    if (!token) {
      throw new AppError('Unauthorized: No token provided', 401);
    }

    // 1. Try Firebase ID Token
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
      return next();
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      // Fall through to JWT
    }

    // 2. Try JWT fallback
    try {
      const payload = await verifyToken(token);
      if (payload) {
        req.user = {
          id: payload.id || payload.sub,
          email: payload.email,
          role: payload.role || 'user',
          name: payload.name
        };
        return next();
      }
    } catch (err) {
      // Continue
    }

    // 3. Admin Secret Key
    if (token === env.ADMIN_SECRET_KEY) {
      req.user = { id: 'system-admin', role: 'admin', name: 'System Administrator' };
      return next();
    }

    throw new AppError('Unauthorized: Invalid or expired token', 401);
  } catch (error) {
    next(error);
  }
}

export function requireRole(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Forbidden: Insufficient permissions', 403));
    }
    next();
  };
}

export const requireAdmin = requireRole(['admin']);
export const requireTherapist = requireRole(['admin', 'therapist']);
