import { Booking, Therapist, BookingStatus } from '../types';

export function mapBooking(id: string, data: Partial<Booking> & Record<string, unknown>): Booking {
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
    status: (data?.status || 'pending_approval') as BookingStatus,
    paymentStatus: data?.paymentStatus || 'unpaid',
    paymentId: data?.paymentId,
    razorpayOrderId: data?.razorpayOrderId,
    razorpayPaymentId: data?.razorpayPaymentId,
    paymentAmount: data?.paymentAmount,
    paymentCurrency: data?.paymentCurrency,
    paymentVerifiedAt: data?.paymentVerifiedAt,
    paymentLinkSentAt: data?.paymentLinkSentAt,
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

export function mapTherapist(id: string, data: Partial<Therapist> & Record<string, unknown>): Therapist {
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
