import { Booking, Therapist, BookingStatus } from '../types';

export function mapBooking(id: string, data: any): Booking {
  return {
    id,
    therapistId: data?.therapistId || '',
    name: data?.name || 'Unknown',
    email: data?.email || '',
    gender: data?.gender || '',
    age: data?.age || 0,
    date: data?.date || '',
    time: data?.time || '',
    sessionType: data?.sessionType || '',
    message: data?.message || '',
    status: (data?.status || 'pending') as BookingStatus,
    createdAt: data?.createdAt || null,
    updatedAt: data?.updatedAt || null,
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
