/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionReminderService } from './sessionReminderService';
import { adminDb } from '@/lib/firebase/admin';
import { sendEmailAction } from '@/app/api/email/emailSender';
import { auditService } from '@/domains/audit/AuditService';
import { OutboxService } from '@/shared/events/outbox';

vi.mock('@/lib/firebase/admin', () => {
  const getMock = vi.fn();
  const updateMock = vi.fn().mockResolvedValue(undefined);
  const setMock = vi.fn().mockResolvedValue(undefined);
  const docMock = vi.fn(() => ({
    get: getMock,
    update: updateMock,
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ set: setMock }))
    }))
  }));
  const whereMock = vi.fn().mockReturnThis();
  const limitMock = vi.fn().mockReturnThis();
  const getDocsMock = vi.fn();

  return {
    adminDb: {
      collection: vi.fn((colName: string) => {
        if (colName === 'bookings') {
          return {
            doc: docMock,
            where: whereMock,
            limit: limitMock,
            get: getDocsMock
          };
        }
        return { doc: docMock };
      })
    },
    FieldValue: {
      serverTimestamp: vi.fn(() => 'MOCK_SERVER_TIMESTAMP')
    }
  };
});

vi.mock('@/app/api/email/emailSender', () => ({
  sendEmailAction: vi.fn().mockResolvedValue({ success: true, studentSent: true, therapistSent: true })
}));

vi.mock('@/domains/audit/AuditService', () => ({
  auditService: {
    logEvent: vi.fn().mockResolvedValue('evt_audit_mock')
  }
}));

vi.mock('@/shared/events/outbox', () => ({
  OutboxService: {
    recordEvent: vi.fn().mockResolvedValue(undefined)
  },
  generateDeterministicEventId: vi.fn((agg, id, name) => `${agg}_${id}_${name}`)
}));

vi.mock('@/app/api/_lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn()
  }
}));

describe('SessionReminderService (Phase 3A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateReminderTimeIST', () => {
    it('should calculate exactly 5 hours before session start in Asia/Kolkata timezone', () => {
      // 03:00 PM session on 2026-09-15 is 15:00:00+05:30
      // 5 hours prior should be 10:00:00+05:30 (04:30:00 UTC)
      const calculation = SessionReminderService.calculateReminderTimeIST('2026-09-15', '03:00 PM');
      
      expect(calculation.sessionStartIso).toBe('2026-09-15T15:00:00+05:30');
      expect(calculation.sessionEndIso).toBe('2026-09-15T15:45:00+05:30');

      const expectedReminderTimeMillis = new Date('2026-09-15T15:00:00+05:30').getTime() - (5 * 3600 * 1000);
      expect(calculation.reminderTimeMillis).toBe(expectedReminderTimeMillis);
      expect(new Date(calculation.reminderTimeMillis).toISOString()).toBe('2026-09-15T04:30:00.000Z');
    });

    it('should handle morning sessions crossing over midnight correctly', () => {
      // 02:00 AM session on 2026-09-15 is 02:00:00+05:30
      // 5 hours prior should be 2026-09-14 21:00:00+05:30 (15:30:00 UTC)
      const calculation = SessionReminderService.calculateReminderTimeIST('2026-09-15', '02:00 AM');
      const expectedReminderMillis = new Date('2026-09-15T02:00:00+05:30').getTime() - (5 * 3600 * 1000);
      expect(calculation.reminderTimeMillis).toBe(expectedReminderMillis);
      expect(new Date(calculation.reminderTimeMillis).toISOString()).toBe('2026-09-14T15:30:00.000Z');
    });
  });

  describe('scheduleSessionReminder', () => {
    it('should record an outbox event scheduled 5 hours before future session', async () => {
      const mockBooking = {
        id: 'bk_rem_1',
        name: 'Alex Smith',
        email: 'alex@example.com',
        phone: '9876543210',
        date: '2028-10-10',
        time: '04:00 PM',
        status: 'confirmed',
        paymentStatus: 'paid',
        therapistId: 'th_123',
        userId: 'usr_1'
      };

      const docMock = (adminDb.collection('bookings').doc as any)('bk_rem_1');
      docMock.get.mockResolvedValue({
        exists: true,
        data: () => mockBooking
      });

      const res = await SessionReminderService.scheduleSessionReminder('bk_rem_1');

      expect(res.scheduled).toBe(true);
      expect(OutboxService.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'SendSessionReminder',
          aggregateType: 'booking',
          aggregateId: 'bk_rem_1',
        })
      );
      expect(docMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          reminderStatus: 'PENDING'
        })
      );
      expect(auditService.logEvent).toHaveBeenCalledWith('REMINDER_SCHEDULED', expect.anything(), 'usr_1', 'bk_rem_1');
    });

    it('should skip scheduling for non-confirmed or non-paid bookings', async () => {
      const mockBooking = {
        id: 'bk_unpaid',
        status: 'pending_payment',
        paymentStatus: 'unpaid'
      };

      const docMock = (adminDb.collection('bookings').doc as any)('bk_unpaid');
      docMock.get.mockResolvedValue({
        exists: true,
        data: () => mockBooking
      });

      const res = await SessionReminderService.scheduleSessionReminder('bk_unpaid');
      expect(res.scheduled).toBe(false);
      expect(OutboxService.recordEvent).not.toHaveBeenCalled();
    });
  });

  describe('sendSessionReminder - Idempotency & Eligibility', () => {
    it('should send email and mark status as SENT for valid confirmed booking with meetingUrl', async () => {
      const mockBooking = {
        id: 'bk_eligible',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '9998887776',
        date: '2028-10-10',
        time: '02:00 PM',
        status: 'confirmed',
        paymentStatus: 'paid',
        meetingUrl: 'https://meet.google.com/saa-rthi-9999',
        therapistId: 'th_777',
        userId: 'usr_john'
      };

      const docMock = (adminDb.collection('bookings').doc as any)('bk_eligible');
      docMock.get.mockResolvedValue({
        exists: true,
        data: () => mockBooking
      });

      const res = await SessionReminderService.sendSessionReminder('bk_eligible');

      expect(res.success).toBe(true);
      expect(res.studentSent).toBe(true);
      expect(sendEmailAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'session-reminder',
          bookingId: 'bk_eligible',
          meetingUrl: 'https://meet.google.com/saa-rthi-9999'
        })
      );
      expect(docMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          reminderStatus: 'SENT',
          reminderError: null
        })
      );
      expect(auditService.logEvent).toHaveBeenCalledWith('REMINDER_SENT', expect.anything(), 'usr_john', 'bk_eligible');
    });

    it('should be idempotent and skip duplicate email if reminderStatus is already SENT', async () => {
      const mockBooking = {
        id: 'bk_already_sent',
        status: 'confirmed',
        paymentStatus: 'paid',
        reminderStatus: 'SENT',
        reminderSentAt: new Date(),
        meetingUrl: 'https://meet.google.com/saa-rthi-1111'
      };

      const docMock = (adminDb.collection('bookings').doc as any)('bk_already_sent');
      docMock.get.mockResolvedValue({
        exists: true,
        data: () => mockBooking
      });

      const res = await SessionReminderService.sendSessionReminder('bk_already_sent');

      expect(res.success).toBe(true);
      expect(res.alreadySent).toBe(true);
      expect(sendEmailAction).not.toHaveBeenCalled();
      expect(docMock.update).not.toHaveBeenCalled();
    });

    it('should fail gracefully and record REMINDER_FAILED if meetingUrl is missing', async () => {
      const mockBooking = {
        id: 'bk_no_meet',
        status: 'confirmed',
        paymentStatus: 'paid',
        meetingUrl: null, // Missing meeting URL
        date: '2028-10-10',
        time: '02:00 PM'
      };

      const docMock = (adminDb.collection('bookings').doc as any)('bk_no_meet');
      docMock.get.mockResolvedValue({
        exists: true,
        data: () => mockBooking
      });

      const res = await SessionReminderService.sendSessionReminder('bk_no_meet');

      expect(res.success).toBe(false);
      expect(res.error).toContain('Meeting URL is not available');
      expect(sendEmailAction).not.toHaveBeenCalled();
      expect(docMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          reminderStatus: 'FAILED',
          reminderError: 'Missing meeting URL'
        })
      );
      expect(auditService.logEvent).toHaveBeenCalledWith('REMINDER_FAILED', expect.anything(), 'system', 'bk_no_meet');
    });
  });
});
