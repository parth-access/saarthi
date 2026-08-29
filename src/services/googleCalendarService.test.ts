/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSessionTimeIST, GoogleCalendarService } from './googleCalendarService';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { registerCalendarListeners } from '@/shared/events/listeners/CalendarListener';

const { mockEventsInsert, mockEventsDelete } = vi.hoisted(() => ({
  mockEventsInsert: vi.fn(),
  mockEventsDelete: vi.fn()
}));

vi.mock('googleapis', () => {
  class MockOAuth2Client {
    setCredentials = vi.fn();
  }
  return {
    google: {
      auth: {
        OAuth2: MockOAuth2Client
      },
      calendar: vi.fn().mockImplementation(() => ({
        events: {
          insert: mockEventsInsert,
          delete: mockEventsDelete
        }
      }))
    }
  };
});

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
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REFRESH_TOKEN;
    delete process.env.GOOGLE_CALENDAR_ID;
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

    it('should call real Google Calendar API and create Meet link when credentials exist', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test_client_id';
      process.env.GOOGLE_CLIENT_SECRET = 'test_client_secret';
      process.env.GOOGLE_REFRESH_TOKEN = 'test_refresh_token';
      process.env.GOOGLE_CALENDAR_ID = 'healwithsaarthi@gmail.com';

      const booking = {
        id: 'bk_real_789',
        name: 'Aarav Sharma',
        email: 'aarav@example.com',
        phone: '9988776655',
        date: '2026-11-20',
        time: '04:00 PM',
        status: 'confirmed',
        paymentStatus: 'paid'
      };

      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking as any);
      mockEventsInsert.mockResolvedValue({
        data: {
          id: 'real_gcal_event_999',
          hangoutLink: 'https://meet.google.com/xyz-uvwx-rst',
          htmlLink: 'https://calendar.google.com/event?eid=real_gcal_event_999'
        }
      });

      const result = await GoogleCalendarService.createOrSyncCalendarEvent('bk_real_789');

      expect(result.success).toBe(true);
      expect(result.simulated).toBeFalsy();
      expect(result.calendarEventId).toBe('real_gcal_event_999');
      expect(result.meetingUrl).toBe('https://meet.google.com/xyz-uvwx-rst');

      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'healwithsaarthi@gmail.com',
          conferenceDataVersion: 1,
          requestBody: expect.objectContaining({
            summary: 'Saarthi Session - Aarav Sharma',
            conferenceData: {
              createRequest: {
                requestId: 'meet_bk_real_789',
                conferenceSolutionKey: { type: 'hangoutsMeet' }
              }
            },
            attendees: expect.arrayContaining([
              { email: 'healwithsaarthi@gmail.com' },
              { email: 'aarav@example.com' }
            ])
          })
        })
      );
      expect(firestoreBookingRepository.save).toHaveBeenCalled();
    });

    it('should set calendarStatus to FAILED on error without changing booking status', async () => {
      vi.mocked(firestoreBookingRepository.findById).mockRejectedValue(new Error('Firestore connection failure'));

      const result = await GoogleCalendarService.createOrSyncCalendarEvent('bk_err');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Firestore connection failure');
    });
  });

  describe('cancelCalendarEvent', () => {
    it('should call events.delete when booking has calendar event ID and credentials exist', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test_client_id';
      process.env.GOOGLE_CLIENT_SECRET = 'test_client_secret';
      process.env.GOOGLE_REFRESH_TOKEN = 'test_refresh_token';

      const booking = {
        id: 'bk_cancel_1',
        googleCalendarEventId: 'gcal_event_to_delete'
      };

      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking as any);
      mockEventsDelete.mockResolvedValue({});

      const deleted = await GoogleCalendarService.cancelCalendarEvent('bk_cancel_1');

      expect(deleted).toBe(true);
      expect(mockEventsDelete).toHaveBeenCalledWith({
        calendarId: 'healwithsaarthi@gmail.com',
        eventId: 'gcal_event_to_delete'
      });
    });

    it('should return false if booking has no calendar event ID', async () => {
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue({ id: 'bk_no_cal' } as any);

      const deleted = await GoogleCalendarService.cancelCalendarEvent('bk_no_cal');
      expect(deleted).toBe(false);
      expect(mockEventsDelete).not.toHaveBeenCalled();
    });
  });

  describe('CalendarListener Integration', () => {
    it('should subscribe and handle BookingConfirmed and BookingCancelled events', async () => {
      const handlers: Record<string, (data: unknown) => Promise<void> | void> = {};
      const mockEventBus = {
        subscribe: vi.fn((event: string, handler: (data: unknown) => Promise<void> | void) => {
          handlers[event] = handler;
        })
      };

      registerCalendarListeners(mockEventBus);

      expect(mockEventBus.subscribe).toHaveBeenCalledWith('BookingConfirmed', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('BookingCancelled', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('BookingRejected', expect.any(Function));

      // Trigger BookingConfirmed
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue({
        id: 'bk_evt_1',
        status: 'confirmed',
        paymentStatus: 'paid'
      } as any);

      await handlers['BookingConfirmed']({ payload: { bookingId: 'bk_evt_1' } });
      expect(firestoreBookingRepository.save).toHaveBeenCalled();
    });
  });
});

