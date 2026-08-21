/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSessionTimeIST, GoogleCalendarService } from './googleCalendarService';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';

vi.mock('@/domains/booking/repository/FirestoreBookingRepository', () => ({
  firestoreBookingRepository: {
    findById: vi.fn(),
    save: vi.fn()
  }
}));

vi.mock('@/domains/audit/AuditService', () => ({
  auditService: {
    logEvent: vi.fn().mockResolvedValue('evt_mock')
  }
}));

vi.mock('@/app/api/_lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn()
  }
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false })
      })
    })
  }
}));

describe('GoogleCalendarService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseSessionTimeIST', () => {
    it('should correctly format 10:00 AM session into Asia/Kolkata ISO string', () => {
      const { startIso, endIso } = parseSessionTimeIST('2026-09-15', '10:00 AM');
      expect(startIso).toBe('2026-09-15T10:00:00+05:30');
      expect(endIso).toBe('2026-09-15T10:50:00+05:30');
    });

    it('should correctly format 02:30 PM session into 14:30 Asia/Kolkata ISO string', () => {
      const { startIso, endIso } = parseSessionTimeIST('2026-09-15', '02:30 PM');
      expect(startIso).toBe('2026-09-15T14:30:00+05:30');
      expect(endIso).toBe('2026-09-15T15:20:00+05:30');
    });

    it('should correctly format 12:00 PM session', () => {
      const { startIso, endIso } = parseSessionTimeIST('2026-09-15', '12:00 PM');
      expect(startIso).toBe('2026-09-15T12:00:00+05:30');
      expect(endIso).toBe('2026-09-15T12:50:00+05:30');
    });
  });

  describe('createOrSyncCalendarEvent - Idempotency', () => {
    it('should return existing details if googleCalendarEventId and meetingUrl already exist', async () => {
      const existingBooking = {
        id: 'bk_123',
        status: 'confirmed',
        paymentStatus: 'paid',
        googleCalendarEventId: 'gcal_existing_123',
        meetingUrl: 'https://meet.google.com/saa-rthi-1234'
      };

      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(existingBooking as any);

      const result = await GoogleCalendarService.createOrSyncCalendarEvent('bk_123');

      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBe(true);
      expect(result.calendarEventId).toBe('gcal_existing_123');
      expect(result.meetingUrl).toBe('https://meet.google.com/saa-rthi-1234');
      expect(firestoreBookingRepository.save).not.toHaveBeenCalled();
    });

    it('should generate simulated calendar event when env variables are not present', async () => {
      const booking = {
        id: 'bk_456',
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '9876543210',
        date: '2026-10-10',
        time: '11:00 AM',
        status: 'confirmed',
        paymentStatus: 'paid'
      };

      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking as any);

      const result = await GoogleCalendarService.createOrSyncCalendarEvent('bk_456');

      expect(result.success).toBe(true);
      expect(result.simulated).toBe(true);
      expect(result.calendarEventId).toContain('gcal_bk_456');
      expect(result.meetingUrl).toContain('https://meet.google.com/saa-rthi-');
      expect(firestoreBookingRepository.save).toHaveBeenCalled();
    });

    it('should set calendarStatus to FAILED on error without changing booking status', async () => {
      vi.mocked(firestoreBookingRepository.findById).mockRejectedValue(new Error('Firestore connection failure'));

      const result = await GoogleCalendarService.createOrSyncCalendarEvent('bk_err');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Firestore connection failure');
    });
  });
});
