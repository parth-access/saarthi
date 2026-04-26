import { Router } from 'express';
import admin, { db } from '../config/firebase';
import { verifyUser, requireAdmin, AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/error';

const router = Router();

router.use(verifyUser);
router.use(requireAdmin);

// /admin/set-role
router.post('/set-role', async (req: AuthRequest, res, next) => {
  try {
    const adminUser = req.user;
    const { targetUserId, role } = req.body;

    const ALLOWED_ROLES = ['admin', 'therapist', 'user'];
    if (!targetUserId || !ALLOWED_ROLES.includes(role)) {
      throw new AppError('Invalid user ID or role. Allowed roles: admin, therapist, user', 400);
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

    await db.collection('audit_logs').add({
      actorUserId: adminUser.id,
      action: 'ROLE_CHANGE',
      targetUserId: targetUserId,
      metadata: {
        oldRole,
        newRole: role,
        email: oldData?.email
      },
      timestamp: admin.firestore.Timestamp.now()
    });

    res.status(200).json({ 
      success: true, 
      message: `User role updated from ${oldRole || 'none'} to ${role}` 
    });
  } catch (error) {
    next(error);
  }
});

export default router;
