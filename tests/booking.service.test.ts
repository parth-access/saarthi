import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bookingService } from '../lib/services/booking.service.js';
import { db } from '../api/firebase-admin.js';
import { AppError } from '../lib/utils/error.js';

// Mock dependencies
vi.mock('../api/firebase-admin.js', () => ({
  db: {
    collection: vi.fn(),
    runTransaction: vi.fn(),
  }
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

vi.mock('../lib/services/analytics.service.js', () => ({
  analyticsService: {
    trackEvent: vi.fn(),
  }
}));

vi.mock('../lib/services/queue.service.js', () => ({
  queueService: {
    enqueueEmail: vi.fn(),
  }
}));

describe('Booking Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default collection mock
    (db.collection as any).mockReturnValue({
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      doc: vi.fn().mockImplementation((id) => {
        const actualId = id || `new-id-${Math.random()}`;
        return { path: `test/${actualId}`, id: actualId };
      })
    });
  });

  it('successful booking creation', async () => {
    const input = {
      name: 'John Doe',
      email: 'john@example.com',
      therapistId: 't1',
      date: '2026-05-01',
      time: '10:00',
      sessionType: 'chat',
      message: 'Hello',
      lockId: 'lock123'
    };

    (db.runTransaction as any).mockImplementation(async (cb: any) => {
      const transaction = {
        get: vi.fn().mockImplementation((refOrQuery) => {
          // If it's the therapist lookup
          if (refOrQuery.path?.includes('therapists')) {
            return { exists: true, data: () => ({ name: 'Therapist Name' }) };
          }
          // If it's the lock lookup
          if (refOrQuery.path?.includes('lock123')) {
            return { exists: true, data: () => ({ 
              expiresAt: { toDate: () => new Date(Date.now() + 100000) },
              therapistId: 't1', date: '2026-05-01', time: '10:00' 
            }) };
          }
          // For double booking check
          return { empty: true, docs: [] };
        }),
        set: vi.fn(),
        delete: vi.fn(),
      };
      return await cb(transaction);
    });

    const result = await bookingService.createBooking(input as any);
    expect(result.bookingId).toBeDefined();
  });

  it('fails on double booking (SLOT_OCCUPIED)', async () => {
    const input = {
      therapistId: 't1',
      date: '2026-05-01',
      time: '10:00',
      lockId: 'lock456'
    };

    (db.runTransaction as any).mockImplementation(async (cb: any) => {
      const transaction = {
        get: vi.fn().mockImplementation((refOrQuery) => {
          // Simulate existing booking
          if (!refOrQuery.path) {
            return { empty: false }; 
          }
          return { exists: true };
        }),
      };
      return await cb(transaction);
    });

    await expect(bookingService.createBooking(input as any))
      .rejects.toThrow();
  });

  it('fails on lock expiry', async () => {
    const input = {
      therapistId: 't1',
      date: '2026-05-01',
      time: '11:00',
      lockId: 'lockExpired'
    };

    (db.runTransaction as any).mockImplementation(async (cb: any) => {
      const transaction = {
        get: vi.fn().mockImplementation((refOrQuery) => {
          if (refOrQuery.path?.includes('lockExpired')) {
            return { exists: true, data: () => ({ 
              expiresAt: { toDate: () => new Date(Date.now() - 10000) }, // Expired
              therapistId: 't1', date: '2026-05-01', time: '11:00' 
            }) };
          }
          return { empty: true };
        }),
      };
      return await cb(transaction);
    });

    await expect(bookingService.createBooking(input as any))
      .rejects.toThrow(/expired/i);
  });
});
