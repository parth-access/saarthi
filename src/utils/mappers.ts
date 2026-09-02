import { Booking, Therapist, BookingStatus } from '../types';
import { parseAgeInput } from '../shared/validation/age';

export function mapBooking(id: string, data: Partial<Booking> & Record<string, unknown>): Booking {
  return {
    id,
    therapistId: data?.therapistId || '',
    name: data?.name || 'Unknown',
    email: data?.email || '',
    phone: data?.phone || '',
    gender: data?.gender || '',
    // `data?.age || 0` used to turn an absent age into a confident "0", which the
    // therapist/admin card then rendered as "0y". Absence must stay absent so the
    // UI can say so. Legacy docs may hold the age as a string, hence the parse;
    // an out-of-range value (e.g. a stored `1`) is deliberately NOT dropped here —
    // the display layer flags it, so a real data problem stays visible.
    age: parseAgeInput(data?.age) ?? undefined,
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
  const name = data?.name || 'Unknown Therapist';
  const rawSlug = data?.slug || (name.toLowerCase().includes('dravina') ? 'dravina' : undefined);
  return {
    id,
    name,
    specialization: data?.specialization || '',
    experience: data?.experience || '',
    bio: data?.bio || '',
    image: data?.image || '',
    active: data?.active !== undefined ? !!data?.active : true,
    slug: rawSlug,
    authId: data?.authId || '',
    email: data?.email || '',
  };
}
