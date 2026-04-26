import { Router } from 'express';
import { db } from '../../api/firebase-admin.js';
import admin from 'firebase-admin';
import { verifyUser, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { createAuditLog, AuditAction } from '../../lib/services/audit.js';
import { AppError } from '../../lib/utils/error.js';

const router = Router();

router.use(verifyUser);
router.use(requireAdmin);

// /api/admin/set-role
router.post('/set-role', async (req: AuthRequest, res, next) => {
  try {
    const adminUser = req.user;
    const { targetUserId, role } = req.body;

    const ALLOWED_ROLES = ['admin', 'therapist', 'user'];
    if (!targetUserId || !ALLOWED_ROLES.includes(role)) {
      throw new AppError('Invalid user ID or role. Allowed roles: admin, therapist, user', 400);
    }

    if (adminUser.id === targetUserId && role !== 'admin') {
      console.warn(`Admin ${adminUser.id} is de-escalating themselves to ${role}`);
    }

    const userRef = db.collection('users').doc(targetUserId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new AppError('User not found in system', 404);
    }

    const oldData = userDoc.data();
    const oldRole = oldData?.role;

    await userRef.update({
      role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await createAuditLog(
      adminUser.id,
      AuditAction.ROLE_CHANGE,
      targetUserId,
      {
        oldRole,
        newRole: role,
        email: oldData?.email
      }
    );

    res.status(200).json({ 
      success: true, 
      message: `User role updated from ${oldRole || 'none'} to ${role}` 
    });
  } catch (error) {
    next(error);
  }
});

export default router;
