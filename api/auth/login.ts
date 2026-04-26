import { db } from '../firebase-admin.js';
import admin from 'firebase-admin';
import { handleError } from '../../lib/utils/error.js';
import { env } from '../../lib/env.js';
import { createAuditLog, AuditAction } from '../../lib/services/audit.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { idToken } = req.body;

  try {
    // 1. Verify token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    // 2. Check if user exists in database
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    let userData;

    if (!userDoc.exists) {
      // 3. Create new user with default role
      // Check if this email is designated as admin
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

      // Audit new user creation
      await createAuditLog(
        uid,
        AuditAction.SYSTEM_INIT,
        uid,
        {
          email,
          role: userData.role,
          message: 'Initial user registration'
        }
      );
    } else {
      userData = userDoc.data();
    }

    return res.status(200).json({
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
    return handleError(res, error);
  }
}
