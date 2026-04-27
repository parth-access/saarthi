import { Request, Response, NextFunction } from 'express';
import admin from '../config/firebase';

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    role: 'admin' | 'user' | 'therapist';
  };
}

export const verifyUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Fetch user role from Firestore
    const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
    let role = 'user';
    if (userDoc.exists) {
      role = userDoc.data()?.role || 'user';
    } else {
      // Create user doc if it doesn't exist
      await admin.firestore().collection('users').doc(decodedToken.uid).set({
        email: decodedToken.email,
        role: 'user',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: role as 'admin' | 'user' | 'therapist'
    };

    next();
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Forbidden: Requires admin role' });
  }
  next();
};
