export type AuditEventType = 
  | 'BOOKING_CREATED'
  | 'BOOKING_UPDATED'
  | 'PAYMENT_CREATED'
  | 'PAYMENT_STARTED'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_LINK_SENT'
  | 'EMAIL_SENT'
  | 'EMAIL_FAILED'
  | 'SYSTEM_ERROR'
  | 'CALENDAR_CREATION_STARTED'
  | 'CALENDAR_EVENT_CREATED'
  | 'CALENDAR_CREATION_FAILED'
  | 'CALENDAR_CREATION_RETRY'
  | 'REMINDER_SCHEDULED'
  | 'REMINDER_SENT'
  | 'REMINDER_FAILED'
  | 'REMINDER_SKIPPED';

export interface AuditEvent {
  id: string; // evt_xxx
  type: AuditEventType;
  timestamp: string;
  actorId?: string; // e.g. system, usr_xxx
  targetId?: string; // bk_xxx, pay_xxx
  metadata?: Record<string, unknown>;
}
