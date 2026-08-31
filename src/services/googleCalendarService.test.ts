/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSessionTimeIST, GoogleCalendarService } from './googleCalendarService';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { registerCalendarListeners } from '@/shared/events/listeners/CalendarListener';
import { sendEmailAction } from '@/app/api/email/emailSender';

const { mockEventsInsert, mockEventsDelete, mockEventsPatch, mockEventsGet, mockDocUpdate } = vi.hoisted(() => ({
  mockEventsInsert: vi.fn(),
  mockEventsDelete: vi.fn(),
  mockEventsPatch: vi.fn(),
  mockEventsGet: vi.fn(),
  mockDocUpdate: vi.fn()
}));

vi.mock('googleapis', () => {
  class MockOAuth2Client {
    setCredentials = vi.fn();
  }
  return {
    google: {
      auth: { OAuth2: MockOAuth2Client },
      calendar: vi.fn().mockImplementation(() => ({
        events: {
          insert: mockEventsInsert,
          delete: mockEventsDelete,
          patch: mockEventsPatch,
          get: mockEventsGet
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
  auditService: { logEvent: vi.fn().mockResolvedValue('evt_mock') }
}));

vi.mock('@/app/api/_lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), success: vi.fn() }
}));

vi.mock('./sessionReminderService', () => ({
  SessionReminderService: { scheduleSessionReminder: vi.fn().mockResolvedValue(undefined) }
}));

vi.mock('@/app/api/email/emailSender', () => ({
  sendEmailAction: vi.fn().mockResolvedValue({ success: true })
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false }),
        update: mockDocUpdate
      })
    })
  }
}));

const REAL_CREDS = () => {
  process.env.GOOGLE_CLIENT_ID = 'test_client_id';
  process.env.GOOGLE_CLIENT_SECRET = 'test_client_secret';
  process.env.GOOGLE_REFRESH_TOKEN = 'test_refresh_token';
  process.env.GOOGLE_CALENDAR_ID = 'healwithsaarthi@gmail.com';
};

// CHUNK_MARKER_TESTS

describe('GoogleCalendarService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocUpdate.mockResolvedValue({});
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REFRESH_TOKEN;
    delete process.env.GOOGLE_CALENDAR_ID;
  });

  describe('parseSessionTimeIST', () => {
    it('formats 10:00 AM into Asia/Kolkata ISO (50-min session)', () => {
      const { startIso, endIso } = parseSessionTimeIST('2026-09-15', '10:00 AM');
      expect(startIso).toBe('2026-09-15T10:00:00+05:30');
      expect(endIso).toBe('2026-09-15T10:50:00+05:30');
    });
    it('formats 02:30 PM into 14:30 Asia/Kolkata ISO', () => {
      const { startIso, endIso } = parseSessionTimeIST('2026-09-15', '02:30 PM');
      expect(startIso).toBe('2026-09-15T14:30:00+05:30');
      expect(endIso).toBe('2026-09-15T15:20:00+05:30');
    });
  });

  const confirmedBooking = (overrides: Record<string, any> = {}) => ({
    id: 'bk_real_789',
    therapistId: 'th_1',
    name: 'Aarav Sharma',
    email: 'aarav@example.com',
    phone: '9988776655',
    date: '2026-11-20',
    time: '04:00 PM',
    sessionType: 'Individual',
    status: 'confirmed',
    paymentStatus: 'paid',
    ...overrides
  });

  describe('createOrSyncCalendarEvent — real event creation', () => {
    it('(1) creates exactly one calendar event for a confirmed booking', async () => {
      REAL_CREDS();
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(confirmedBooking() as any);
      mockEventsInsert.mockResolvedValue({
        data: { id: 'real_gcal_event_999', hangoutLink: 'https://meet.google.com/xyz-uvwx-rst' }
      });

      const result = await GoogleCalendarService.createOrSyncCalendarEvent('bk_real_789');

      expect(result.success).toBe(true);
      expect(mockEventsInsert).toHaveBeenCalledTimes(1);
      expect(firestoreBookingRepository.save).toHaveBeenCalled();
    });

    it('(2) requests a real Google Meet conference (createRequest + conferenceDataVersion:1)', async () => {
      REAL_CREDS();
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(confirmedBooking() as any);
      mockEventsInsert.mockResolvedValue({
        data: { id: 'real_gcal_event_999', hangoutLink: 'https://meet.google.com/xyz-uvwx-rst' }
      });

      await GoogleCalendarService.createOrSyncCalendarEvent('bk_real_789');

      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          conferenceDataVersion: 1,
          requestBody: expect.objectContaining({
            conferenceData: {
              createRequest: {
                requestId: 'meet_bk_real_789',
                conferenceSolutionKey: { type: 'hangoutsMeet' }
              }
            }
          })
        })
      );
    });

    it('(3) persists calendar event ID + real Meet URL + CREATED status', async () => {
      REAL_CREDS();
      const booking = confirmedBooking();
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking as any);
      mockEventsInsert.mockResolvedValue({
        data: { id: 'real_gcal_event_999', hangoutLink: 'https://meet.google.com/xyz-uvwx-rst' }
      });

      const result = await GoogleCalendarService.createOrSyncCalendarEvent('bk_real_789');

      expect(result.calendarEventId).toBe('real_gcal_event_999');
      expect(result.meetingUrl).toBe('https://meet.google.com/xyz-uvwx-rst');
      const saved = vi.mocked(firestoreBookingRepository.save).mock.calls[0][0] as any;
      expect(saved.googleCalendarEventId).toBe('real_gcal_event_999');
      expect(saved.meetingUrl).toBe('https://meet.google.com/xyz-uvwx-rst');
      expect(saved.calendarStatus).toBe('CREATED');
    });

    it('(12) uses healwithsaarthi@gmail.com as the source/organizer calendar with correct attendees', async () => {
      REAL_CREDS();
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(confirmedBooking() as any);
      mockEventsInsert.mockResolvedValue({
        data: { id: 'real_gcal_event_999', hangoutLink: 'https://meet.google.com/xyz-uvwx-rst' }
      });

      await GoogleCalendarService.createOrSyncCalendarEvent('bk_real_789');

      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'healwithsaarthi@gmail.com',
          requestBody: expect.objectContaining({
            summary: 'Saarthi Session - Aarav Sharma',
            attendees: expect.arrayContaining([
              { email: 'healwithsaarthi@gmail.com' },
              { email: 'aarav@example.com' }
            ])
          })
        })
      );
    });

    it('sends the confirmation email WITH the real Meet link after success', async () => {
      REAL_CREDS();
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(confirmedBooking() as any);
      mockEventsInsert.mockResolvedValue({
        data: { id: 'real_gcal_event_999', hangoutLink: 'https://meet.google.com/xyz-uvwx-rst' }
      });

      await GoogleCalendarService.createOrSyncCalendarEvent('bk_real_789');

      expect(sendEmailAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'booking-confirmed',
          bookingId: 'bk_real_789',
          meetingUrl: 'https://meet.google.com/xyz-uvwx-rst'
        })
      );
    });
  });

  describe('createOrSyncCalendarEvent — idempotency (no duplicate events)', () => {
    it('(4) second call with event+link already stored does NOT insert again', async () => {
      REAL_CREDS();
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(confirmedBooking({
        googleCalendarEventId: 'real_gcal_event_999',
        meetingUrl: 'https://meet.google.com/xyz-uvwx-rst'
      }) as any);

      const result = await GoogleCalendarService.createOrSyncCalendarEvent('bk_real_789');

      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBe(true);
      expect(mockEventsInsert).not.toHaveBeenCalled();
      expect(firestoreBookingRepository.save).not.toHaveBeenCalled();
    });

    it('(5) duplicate BookingConfirmed delivery creates only one event across two calls', async () => {
      REAL_CREDS();
      // First delivery: no event yet -> inserts once.
      const fresh = confirmedBooking();
      const withEvent = confirmedBooking({
        googleCalendarEventId: 'real_gcal_event_999',
        meetingUrl: 'https://meet.google.com/xyz-uvwx-rst'
      });
      vi.mocked(firestoreBookingRepository.findById)
        .mockResolvedValueOnce(fresh as any)
        .mockResolvedValueOnce(withEvent as any);
      mockEventsInsert.mockResolvedValue({
        data: { id: 'real_gcal_event_999', hangoutLink: 'https://meet.google.com/xyz-uvwx-rst' }
      });

      await GoogleCalendarService.createOrSyncCalendarEvent('bk_real_789');
      await GoogleCalendarService.createOrSyncCalendarEvent('bk_real_789');

      expect(mockEventsInsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateCalendarEvent — reschedule (patch existing, no duplicate)', () => {
    it('(6) patches the existing event to the new time and does NOT insert a new one', async () => {
      REAL_CREDS();
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(confirmedBooking({
        googleCalendarEventId: 'real_gcal_event_999',
        meetingUrl: 'https://meet.google.com/xyz-uvwx-rst',
        date: '2026-12-01',
        time: '05:00 PM'
      }) as any);
      mockEventsPatch.mockResolvedValue({
        data: { id: 'real_gcal_event_999', hangoutLink: 'https://meet.google.com/xyz-uvwx-rst' }
      });

      const result = await GoogleCalendarService.updateCalendarEvent('bk_real_789');

      expect(result.success).toBe(true);
      expect(mockEventsPatch).toHaveBeenCalledTimes(1);
      expect(mockEventsInsert).not.toHaveBeenCalled();
      expect(mockEventsPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'healwithsaarthi@gmail.com',
          eventId: 'real_gcal_event_999',
          requestBody: expect.objectContaining({
            start: { dateTime: '2026-12-01T17:00:00+05:30', timeZone: 'Asia/Kolkata' }
          })
        })
      );
      // Meet link preserved across the patch.
      expect(result.meetingUrl).toBe('https://meet.google.com/xyz-uvwx-rst');
    });

    it('(7) repeated reschedule is idempotent — still one event, patch each time, never inserts', async () => {
      REAL_CREDS();
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(confirmedBooking({
        googleCalendarEventId: 'real_gcal_event_999',
        meetingUrl: 'https://meet.google.com/xyz-uvwx-rst'
      }) as any);
      mockEventsPatch.mockResolvedValue({
        data: { id: 'real_gcal_event_999', hangoutLink: 'https://meet.google.com/xyz-uvwx-rst' }
      });

      await GoogleCalendarService.updateCalendarEvent('bk_real_789');
      await GoogleCalendarService.updateCalendarEvent('bk_real_789');

      expect(mockEventsPatch).toHaveBeenCalledTimes(2);
      expect(mockEventsInsert).not.toHaveBeenCalled();
    });
  });

  describe('cancelCalendarEvent — removal + idempotency', () => {
    it('(8) deletes the event and clears stored calendar state', async () => {
      REAL_CREDS();
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(confirmedBooking({
        status: 'cancelled',
        googleCalendarEventId: 'real_gcal_event_999',
        meetingUrl: 'https://meet.google.com/xyz-uvwx-rst'
      }) as any);
      mockEventsDelete.mockResolvedValue({});

      const ok = await GoogleCalendarService.cancelCalendarEvent('bk_real_789');

      expect(ok).toBe(true);
      expect(mockEventsDelete).toHaveBeenCalledWith(
        expect.objectContaining({ calendarId: 'healwithsaarthi@gmail.com', eventId: 'real_gcal_event_999' })
      );
      // Stored state cleared to inactive (FieldValue.delete on the id/url, status CANCELLED).
      expect(mockDocUpdate).toHaveBeenCalledTimes(1);
      const patch = mockDocUpdate.mock.calls[0][0] as any;
      expect(patch.calendarStatus).toBe('CANCELLED');
      expect('googleCalendarEventId' in patch).toBe(true);
      expect('meetingUrl' in patch).toBe(true);
    });

    it('(9) repeated cancellation is idempotent — no error, treats missing event as success', async () => {
      REAL_CREDS();
      // Second cancellation: booking no longer has a stored event id.
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(confirmedBooking({
        status: 'cancelled',
        calendarStatus: 'CANCELLED'
      }) as any);

      const ok = await GoogleCalendarService.cancelCalendarEvent('bk_real_789');

      expect(ok).toBe(true);
      expect(mockEventsDelete).not.toHaveBeenCalled();
    });

    it('treats a 410 (already gone) delete as cancelled success', async () => {
      REAL_CREDS();
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(confirmedBooking({
        status: 'cancelled',
        googleCalendarEventId: 'real_gcal_event_999'
      }) as any);
      mockEventsDelete.mockRejectedValue({ code: 410 });

      const ok = await GoogleCalendarService.cancelCalendarEvent('bk_real_789');

      expect(ok).toBe(true);
      expect(mockDocUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('FAIL CLOSED — never fabricate a meeting URL', () => {
    it('(10) credentials unavailable => NO meetingUrl persisted or emailed, marks RETRY_REQUIRED', async () => {
      // NOTE: REAL_CREDS() intentionally NOT called — env vars absent.
      const booking = confirmedBooking();
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking as any);

      const result = await GoogleCalendarService.createOrSyncCalendarEvent('bk_real_789');

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      expect(result.meetingUrl).toBeUndefined();
      expect(mockEventsInsert).not.toHaveBeenCalled();

      // No fake meet.google.com link written anywhere.
      const saved = vi.mocked(firestoreBookingRepository.save).mock.calls[0][0] as any;
      expect(saved.calendarStatus).toBe('RETRY_REQUIRED');
      expect(saved.meetingUrl).toBeUndefined();

      // No confirmation email with a fabricated link.
      expect(sendEmailAction).not.toHaveBeenCalled();
    });

    it('(11) Google API failure => booking gets FAILED status, NO fake link, retryable', async () => {
      REAL_CREDS();
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(confirmedBooking() as any);
      mockEventsInsert.mockRejectedValue(new Error('Google API 500'));

      const result = await GoogleCalendarService.createOrSyncCalendarEvent('bk_real_789');

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      expect(result.meetingUrl).toBeUndefined();

      // Whatever we persisted, it must NOT contain a fabricated meeting URL.
      const savedCalls = vi.mocked(firestoreBookingRepository.save).mock.calls;
      for (const [savedBooking] of savedCalls) {
        expect((savedBooking as any).meetingUrl).toBeUndefined();
      }
      expect(sendEmailAction).not.toHaveBeenCalledWith(
        expect.objectContaining({ meetingUrl: expect.stringContaining('meet.google.com') })
      );
    });

    it('does NOT persist a link when the API returns an event with no Meet URL (retry recovers via events.get)', async () => {
      REAL_CREDS();
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(confirmedBooking() as any);
      mockEventsInsert.mockResolvedValue({ data: { id: 'real_gcal_event_999' } }); // no hangoutLink

      const result = await GoogleCalendarService.createOrSyncCalendarEvent('bk_real_789');

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      expect(result.meetingUrl).toBeUndefined();
      const saved = vi.mocked(firestoreBookingRepository.save).mock.calls[0][0] as any;
      // Event id persisted so retry uses events.get (no duplicate insert), but no fake link.
      expect(saved.googleCalendarEventId).toBe('real_gcal_event_999');
      expect(saved.meetingUrl).toBeUndefined();
    });
  });

  describe('CalendarListener — event wiring', () => {
    it('subscribes calendar handlers to all four booking lifecycle events', () => {
      const subscribe = vi.fn();
      registerCalendarListeners({ subscribe } as any);

      const subscribedEvents = subscribe.mock.calls.map((c: any[]) => c[0]);
      expect(subscribedEvents).toEqual(
        expect.arrayContaining(['BookingConfirmed', 'BookingRescheduled', 'BookingCancelled', 'BookingRejected'])
      );
    });

    it('BookingRescheduled handler drives updateCalendarEvent (patch, not insert)', async () => {
      REAL_CREDS();
      const handlers: Record<string, (e: any) => Promise<void>> = {};
      const subscribe = vi.fn((name: string, fn: any) => { handlers[name] = fn; });
      registerCalendarListeners({ subscribe } as any);

      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(confirmedBooking({
        googleCalendarEventId: 'real_gcal_event_999',
        meetingUrl: 'https://meet.google.com/xyz-uvwx-rst'
      }) as any);
      mockEventsPatch.mockResolvedValue({
        data: { id: 'real_gcal_event_999', hangoutLink: 'https://meet.google.com/xyz-uvwx-rst' }
      });

      await handlers['BookingRescheduled']({ payload: { bookingId: 'bk_real_789' } });

      expect(mockEventsPatch).toHaveBeenCalledTimes(1);
      expect(mockEventsInsert).not.toHaveBeenCalled();
    });
  });
});

