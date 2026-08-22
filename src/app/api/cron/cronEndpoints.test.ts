/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET as getOutbox, POST as postOutbox } from './process-outbox/route';
import { GET as getReminders, POST as postReminders } from './session-reminders/route';
import { GET as getCompletion, POST as postCompletion } from './session-completion/route';
import { OutboxProcessor } from '@/shared/events/outbox';
import { SessionReminderService } from '@/services/sessionReminderService';
import { SessionLifecycleService } from '@/services/sessionLifecycleService';

vi.mock('@/shared/events/outbox', () => ({
  OutboxProcessor: {
    processBatch: vi.fn()
  }
}));

vi.mock('@/services/sessionReminderService', () => ({
  SessionReminderService: {
    processDueReminders: vi.fn()
  }
}));

vi.mock('@/services/sessionLifecycleService', () => ({
  SessionLifecycleService: {
    autoCompletePastSessions: vi.fn()
  }
}));

describe('Cron Endpoints Authentication & Execution', () => {
  const originalEnv = process.env;
  const VALID_SECRET = 'saarthi_cron_secure_token_2026';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: VALID_SECRET };
    (OutboxProcessor.processBatch as any).mockResolvedValue({ processed: 2, failed: 0 });
    (SessionReminderService.processDueReminders as any).mockResolvedValue({ processed: 5, sent: 2, skipped: 3, failed: 0 });
    (SessionLifecycleService.autoCompletePastSessions as any).mockResolvedValue({ completed: 3, checked: 10, errors: [] });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('1. /api/cron/process-outbox', () => {
    it('rejects unauthenticated GET with 401', async () => {
      const req = new Request('http://localhost:3000/api/cron/process-outbox');
      const res = await getOutbox(req);
      expect(res.status).toBe(401);
      expect(OutboxProcessor.processBatch).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated POST with 401', async () => {
      const req = new Request('http://localhost:3000/api/cron/process-outbox', { method: 'POST' });
      const res = await postOutbox(req);
      expect(res.status).toBe(401);
      expect(OutboxProcessor.processBatch).not.toHaveBeenCalled();
    });

    it('rejects invalid token with 401', async () => {
      const req = new Request('http://localhost:3000/api/cron/process-outbox', {
        headers: { Authorization: 'Bearer wrong_token' }
      });
      const res = await getOutbox(req);
      expect(res.status).toBe(401);
      expect(OutboxProcessor.processBatch).not.toHaveBeenCalled();
    });

    it('returns 500 when CRON_SECRET is missing on server', async () => {
      delete process.env.CRON_SECRET;
      const req = new Request('http://localhost:3000/api/cron/process-outbox', {
        headers: { Authorization: `Bearer ${VALID_SECRET}` }
      });
      const res = await getOutbox(req);
      expect(res.status).toBe(500);
      expect(OutboxProcessor.processBatch).not.toHaveBeenCalled();
    });

    it('executes batch when valid Bearer token is provided (GET & POST)', async () => {
      const getReq = new Request('http://localhost:3000/api/cron/process-outbox', {
        headers: { Authorization: `Bearer ${VALID_SECRET}` }
      });
      const getRes = await getOutbox(getReq);
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.success).toBe(true);
      expect(getBody.processed).toBe(2);
      expect(OutboxProcessor.processBatch).toHaveBeenCalledWith(25);

      const postReq = new Request('http://localhost:3000/api/cron/process-outbox', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VALID_SECRET}` }
      });
      const postRes = await postOutbox(postReq);
      expect(postRes.status).toBe(200);
      expect(OutboxProcessor.processBatch).toHaveBeenCalledTimes(2);
    });
  });

  describe('2. /api/cron/session-reminders', () => {
    it('rejects unauthenticated GET with 401', async () => {
      const req = new Request('http://localhost:3000/api/cron/session-reminders');
      const res = await getReminders(req);
      expect(res.status).toBe(401);
      expect(SessionReminderService.processDueReminders).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated POST with 401', async () => {
      const req = new Request('http://localhost:3000/api/cron/session-reminders', { method: 'POST' });
      const res = await postReminders(req);
      expect(res.status).toBe(401);
      expect(SessionReminderService.processDueReminders).not.toHaveBeenCalled();
    });

    it('returns 500 when CRON_SECRET is missing', async () => {
      delete process.env.CRON_SECRET;
      const req = new Request('http://localhost:3000/api/cron/session-reminders', {
        headers: { Authorization: `Bearer ${VALID_SECRET}` }
      });
      const res = await getReminders(req);
      expect(res.status).toBe(500);
      expect(SessionReminderService.processDueReminders).not.toHaveBeenCalled();
    });

    it('executes reminder processing when valid Bearer token is provided', async () => {
      const req = new Request('http://localhost:3000/api/cron/session-reminders', {
        headers: { Authorization: `Bearer ${VALID_SECRET}` }
      });
      const res = await getReminders(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.sent).toBe(2);
      expect(SessionReminderService.processDueReminders).toHaveBeenCalledWith(25);
    });
  });

  describe('3. /api/cron/session-completion', () => {
    it('rejects unauthenticated GET with 401', async () => {
      const req = new Request('http://localhost:3000/api/cron/session-completion');
      const res = await getCompletion(req);
      expect(res.status).toBe(401);
      expect(SessionLifecycleService.autoCompletePastSessions).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated POST with 401', async () => {
      const req = new Request('http://localhost:3000/api/cron/session-completion', { method: 'POST' });
      const res = await postCompletion(req);
      expect(res.status).toBe(401);
      expect(SessionLifecycleService.autoCompletePastSessions).not.toHaveBeenCalled();
    });

    it('returns 500 when CRON_SECRET is missing even if authorization header is sent', async () => {
      delete process.env.CRON_SECRET;
      const req = new Request('http://localhost:3000/api/cron/session-completion', {
        headers: { Authorization: `Bearer ${VALID_SECRET}` }
      });
      const res = await getCompletion(req);
      expect(res.status).toBe(500);
      expect(SessionLifecycleService.autoCompletePastSessions).not.toHaveBeenCalled();
    });

    it('executes completion task when valid Bearer token is provided', async () => {
      const req = new Request('http://localhost:3000/api/cron/session-completion', {
        headers: { Authorization: `Bearer ${VALID_SECRET}` }
      });
      const res = await getCompletion(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.completed).toBe(3);
      expect(SessionLifecycleService.autoCompletePastSessions).toHaveBeenCalled();
    });
  });
});
