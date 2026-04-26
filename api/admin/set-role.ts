import { db } from '../firebase-admin.js';
import { handleError, AppError } from '../../lib/utils/error.js';
import { requireAdmin } from '../shared/auth-middleware.js';
import { withProductionHarden } from '../../lib/logger.js';
import admin from 'firebase-admin';
import { createAuditLog, AuditAction } from '../../lib/services/audit.js';

async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const adminUser = await requireAdmin(req);
    const { targetUserId, role } = req.body;

    // 1. Strict Role Validation
    const ALLOWED_ROLES = ['admin', 'therapist', 'user'];
    if (!targetUserId || !ALLOWED_ROLES.includes(role)) {
      throw new AppError('Invalid user ID or role. Allowed roles: admin, therapist, user', 400);
    }

    // 2. Prevent Self-Escalation/De-escalation (Optional depending on business rules)
    // If an admin tries to change their own role, we might want to prevent it or require another admin
    if (adminUser.id === targetUserId && role !== 'admin') {
      // For now, let's allow it but it's a risky action
      console.warn(`Admin ${adminUser.id} is de-escalating themselves to ${role}`);
    }

    const userRef = db.collection('users').doc(targetUserId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new AppError('User not found in system', 404);
    }

    const oldData = userDoc.data();
    const oldRole = oldData?.role;

    // 3. Update Role
    await userRef.update({
      role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 4. Create Audit Log
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

    return res.status(200).json({ 
      success: true, 
      message: `User role updated from ${oldRole || 'none'} to ${role}` 
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export default withProductionHarden(handler);
