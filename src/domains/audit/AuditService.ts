import { IdGenerator } from '@/shared/ids';
import { logger } from '@/shared/logger';
import { AuditEvent, AuditEventType } from './AuditEvents';
import { AuditRepository } from './AuditRepository';

export class AuditService {
  private repository?: AuditRepository;

  constructor(repository?: AuditRepository) {
    this.repository = repository;
  }

  public async logEvent(
    type: AuditEventType,
    metadata?: Record<string, unknown>,
    actorId?: string,
    targetId?: string
  ): Promise<string> {
    const event: AuditEvent = {
      id: IdGenerator.event(),
      type,
      timestamp: new Date().toISOString(),
      actorId: actorId || 'system',
      targetId,
      metadata,
    };

    // Application logging
    logger
      .withContext({ eventId: event.id, actorId: event.actorId, targetId: event.targetId })
      .audit(`Audit Event: ${type}`);

    // Storage persistence
    if (this.repository) {
      try {
        await this.repository.saveEvent(event);
      } catch (err) {
        logger.error(`Failed to save audit event ${event.id}`, { error: err });
      }
    }

    return event.id;
  }
}

// Global instance without repository for Phase 1
export const auditService = new AuditService();
