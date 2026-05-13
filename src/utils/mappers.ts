import { Booking, Therapist, BookingStatus } from '../types';

export function mapBooking(id: string, data: any): Booking {
  return {
    id,
    therapistId: data?.therapistId || '',
    name: data?.name || 'Unknown',
    email: data?.email || '',
    phone: data?.phone || '',
    gender: data?.gender || '',
    age: data?.age || 0,
    date: data?.date || '',
    time: data?.time || '',
    sessionType: data?.sessionType || '',
    message: data?.message || '',
    status: (data?.status || 'pending') as BookingStatus,
    createdAt: data?.createdAt || null,
    updatedAt: data?.updatedAt || null,
    bookingToken: data?.bookingToken || '',
    sessionMode: data?.sessionMode || '',
    rescheduledAt: data?.rescheduledAt || null,
    originalDate: data?.originalDate || '',
    originalTime: data?.originalTime || '',
    emailStatus: data?.emailStatus || 'pending',
    emailAttempts: data?.emailAttempts || 0,
    lastEmailAttemptAt: data?.lastEmailAttemptAt || null,
    lastEmailError: data?.lastEmailError || '',
    invalidToken: !!data?.invalidToken,
  };
}

export function mapTherapist(id: string, data: any): Therapist {
  return {
    id,
    name: data?.name || 'Unknown Therapist',
    specialization: data?.specialization || '',
    experience: data?.experience || '',
    bio: data?.bio || '',
    image: data?.image || '',
    active: !!data?.active,
    authId: data?.authId || '',
    email: data?.email || '',
  };
}
