import { Router } from 'express';
import { db } from '../../api/firebase-admin.js';
import admin from 'firebase-admin';
import { env } from '../../lib/env.js';
import { createAuditLog, AuditAction } from '../../lib/services/audit.js';
import { verifyUser, AuthRequest } from '../middleware/auth.js';

const router = Router();

// /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { idToken } = req.body;

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    let userData: any;

    if (!userDoc.exists) {
      const adminEmails = env.BOOTSTRAP_ADMIN_EMAILS?.split(',') || [];
      const isInitialAdmin = adminEmails.includes(email || '');

      userData = {
        id: uid,
        email,
        name: name || email?.split('@')[0] || 'User',
        image: picture,
        role: isInitialAdmin ? 'admin' : 'user',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await userRef.set(userData);

      await createAuditLog(uid, AuditAction.SYSTEM_INIT, uid, {
        email,
        role: userData.role,
        message: 'Initial user registration'
      });
    } else {
      userData = userDoc.data();
    }

    if (!userData) {
      throw new Error('Failed to retrieve user data');
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: uid,
          email: userData.email,
          name: userData.name,
          role: userData.role,
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// /api/auth/me
router.get('/me', verifyUser, (req: AuthRequest, res) => {
  res.status(200).json({
    success: true,
    data: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      name: req.user.name
    }
  });
});

export default router;
