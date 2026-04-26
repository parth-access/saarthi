import { db } from '../../api/firebase-admin.js';
import admin from 'firebase-admin';

export enum AuditAction {
  ROLE_CHANGE = 'ROLE_CHANGE',
  ADMIN_ACTION = 'ADMIN_ACTION',
  USER_UPDATE = 'USER_UPDATE',
  SYSTEM_INIT = 'SYSTEM_INIT'
}

export interface AuditLog {
  actorUserId: string;
  action: AuditAction;
  targetUserId: string | null;
  metadata: Record<string, any>;
  timestamp: admin.firestore.Timestamp;
}

export async function createAuditLog(
  actorUserId: string,
  action: AuditAction,
  targetUserId: string | null,
  metadata: Record<string, any> = {}
) {
  try {
    const log: AuditLog = {
      actorUserId,
      action,
      targetUserId,
      metadata,
      timestamp: admin.firestore.Timestamp.now()
    };
    
    await db.collection('audit_logs').add(log);
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw here to avoid failing main operations just because logging failed
  }
}
