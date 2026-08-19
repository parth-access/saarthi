import { auth } from '../lib/firebase/client';
import { Booking, BookingStatus } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { mapBooking } from '../utils/mappers';
import { logger } from '../utils/logger';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const currentUser = auth?.currentUser;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  
  if (currentUser) {
    const token = await currentUser.getIdToken();
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  options.headers = { ...headers, ...options.headers };
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'API Request Failed');
  }
  
  return data;
}

export const bookingService = {
  lockSlot: async (therapistId: string, date: string, time: string) => {
    try {
      return await fetchWithAuth('/api/bookings/lock-slot', {
        method: 'POST',
        body: JSON.stringify({ therapistId, date, time })
      });
    } catch (err) {
      logger.error('BOOKING', 'Lock slot failed', err);
      return { success: false, error: (err instanceof Error ? err.message : String(err)) };
    }
  },
  
  createBooking: async (
    bookingData: Omit<Booking, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { lockId?: string }
  ) => {
    try {
      const data = await fetchWithAuth('/api/bookings/create', {
        method: 'POST',
        body: JSON.stringify(bookingData)
      });
      logger.success('BOOKING', 'Created booking successfully', { bookingId: data.bookingId });
      return data;
    } catch (err) {
      logger.error('BOOKING', 'Create booking failed', err);
      throw err;
    }
  },

  getBookings: async (): Promise<Booking[]> => {
    try {
      const data = await fetchWithAuth('/api/bookings', { method: 'GET' });
      return (data || []).map((b: Record<string, unknown>) => mapBooking(String(b.id), b));
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.LIST, 'bookings');
      return [];
    }
  },

  getBookingsByTherapist: async (therapistId: string): Promise<Booking[]> => {
    try {
      const data = await fetchWithAuth('/api/bookings?therapistId=' + therapistId, { method: 'GET' });
      return (data || []).map((b: Record<string, unknown>) => mapBooking(String(b.id), b));
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.LIST, 'bookings');
      return [];
    }
  },

  updateStatus: async (id: string, status: BookingStatus) => {
    try {
      await fetchWithAuth('/api/bookings/update-status', {
        method: 'POST',
        body: JSON.stringify({ bookingId: id, status })
      });
      logger.success('BOOKING', 'Updated booking status successfully', { bookingId: id, status });
      return { success: true };
    } catch (err) {
      logger.error('BOOKING', `Failed to update status to ${status}`, err, { bookingId: id });
      throw err;
    }
  },

  declineBooking: async (id: string, adminUid: string, reason: string, customNote: string) => {
    try {
      await fetchWithAuth('/api/bookings/decline', {
        method: 'POST',
        body: JSON.stringify({ bookingId: id, reason, customNote })
      });
      logger.success('BOOKING', 'Declined booking successfully', { bookingId: id });
      return { success: true };
    } catch (err) {
      logger.error('BOOKING', 'Failed to decline booking', err, { bookingId: id });
      throw err;
    }
  },

  rescheduleBooking: async (id: string, newDate: string, newTime: string) => {
    try {
      await fetchWithAuth('/api/bookings/reschedule', {
        method: 'POST',
        body: JSON.stringify({ bookingId: id, newDate, newTime })
      });
      logger.success('BOOKING', 'Rescheduled booking successfully', { bookingId: id, newDate, newTime });
      return { success: true };
    } catch (err) {
      logger.error('BOOKING', 'Failed to reschedule booking', err, { bookingId: id });
      throw err;
    }
  },

  rescheduleByToken: async (token: string, newDate: string, newTime: string) => {
    try {
      const data = await fetchWithAuth('/api/manage-booking', {
        method: 'POST',
        body: JSON.stringify({ token, newDate, newTime })
      });
      logger.success('BOOKING', 'Rescheduled via token successfully', { token: token.slice(0, 5) + '...' });
      return data;
    } catch (err) {
      logger.error('BOOKING', 'Failed to reschedule via token', err);
      throw err;
    }
  },

  getBookingByTokenAPIRoute: async (token: string) => {
    try {
      const response = await fetch(`/api/manage-booking?token=${token}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load booking');
      return data;
    } catch (err) {
      logger.error('BOOKING', 'Failed to get booking by token API route', err);
      throw err;
    }
  }
};
