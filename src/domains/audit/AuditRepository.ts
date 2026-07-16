import { AuditEvent } from './AuditEvents';

export interface AuditRepository {
  saveEvent(event: AuditEvent): Promise<void>;
  getEventsByTarget(targetId: string): Promise<AuditEvent[]>;
}
