import { Router } from 'express';
import * as functions from 'firebase-functions';
import admin, { db } from '../config/firebase';
import { verifyUser, AuthRequest } from '../middleware/auth';

const router = Router();

// /auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { idToken } = req.body;

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    let userData: any;

    if (!userDoc.exists) {
      // Using functions.config() for environment variables
      const adminEmailsConfig = functions.config().admin?.bootstrap_emails || '';
      const adminEmails = adminEmailsConfig.split(',');
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

      // Audit Log concept mapping for functions...
      await db.collection('audit_logs').add({
        actorUserId: uid,
        action: 'SYSTEM_INIT',
        targetUserId: uid,
        metadata: {
          email,
          role: userData.role,
          message: 'Initial user registration'
        },
        timestamp: admin.firestore.Timestamp.now()
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

// /auth/me
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
