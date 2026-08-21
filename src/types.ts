export interface User {
  uid: string;
  email: string;
  name?: string;
  role: 'admin' | 'therapist' | 'client';
}

export type BookingStatus =
  | 'pending'
  | 'pending_approval'
  | 'awaiting_payment'
  | 'pending_payment'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'completed'
  | 'draft'
  | 'locked'
  | 'slot_locked'
  | 'payment_initiated'
  | 'payment_started'
  | 'rescheduled'
  | 'expired'
  | 'no_show';

export type PaymentStatus = 'unpaid' | 'pending' | 'initiated' | 'paid' | 'success' | 'failed' | 'refunded';

export interface FirebaseTimestamp {
  seconds: number;
  nanoseconds: number;
  toDate: () => Date;
  toMillis: () => number;
}

export interface Booking {
  id: string;
  therapistId: string;
  therapistName?: string;
  name: string;
  email: string;
  userId?: string;
  phone: string;
  gender: string;
  age?: number;
  date: string;
  time: string;
  sessionType: string;
  message: string;
  status: BookingStatus;
  paymentStatus?: PaymentStatus;
  paymentId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  paymentAmount?: number;
  paymentCurrency?: string;
  holdExpiresAt?: FirebaseTimestamp | Date | string | null | unknown;
  paymentVerifiedAt?: FirebaseTimestamp | Date | string | null | unknown;
  paymentLinkSentAt?: FirebaseTimestamp | Date | string | null | unknown;
  createdAt: FirebaseTimestamp | Date | string | null | unknown;
  updatedAt?: FirebaseTimestamp | Date | string | null | unknown;
  bookingToken?: string;
  sessionMode?: string;
  rescheduledAt?: FirebaseTimestamp | Date | string | null | unknown;
  originalDate?: string;
  originalTime?: string;
  emailStatus?: 'pending' | 'sent' | 'failed' | 'retrying';
  emailAttempts?: number;
  lastEmailAttemptAt?: FirebaseTimestamp | Date | string | null | unknown;
  lastEmailError?: string;
  declineReason?: string;
  declineCustomNote?: string;
  declinedAt?: FirebaseTimestamp | Date | string | null | unknown;
  declinedBy?: string;
  invalidToken?: boolean;
  utcDateTime?: string; // Standard UTC storage architecture
  googleCalendarEventId?: string;
  meetingUrl?: string;
  calendarStatus?: 'PENDING' | 'CREATED' | 'FAILED' | 'RETRY_REQUIRED';
  calendarCreatedAt?: FirebaseTimestamp | Date | string | null | unknown;
  calendarError?: string;
  reminderStatus?: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  reminderSentAt?: FirebaseTimestamp | Date | string | null | unknown;
  reminderScheduledFor?: FirebaseTimestamp | Date | string | null | unknown;
  reminderError?: string;
  studentReminderSentAt?: FirebaseTimestamp | Date | string | null | unknown;
  therapistReminderSentAt?: FirebaseTimestamp | Date | string | null | unknown;
  reviewRating?: number;
  reviewComment?: string;
  reviewedAt?: FirebaseTimestamp | Date | string | null | unknown;
  reviewId?: string;
}

export interface Review {
  id: string; // review_${bookingId}
  bookingId: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  therapistId: string;
  rating: number; // 1-5 integer
  comment?: string;
  createdAt: FirebaseTimestamp | Date | string | null | unknown;
  updatedAt?: FirebaseTimestamp | Date | string | null | unknown;
}

export interface BreakPreference {
  startTime: string;
  endTime: string;
}

export interface TherapistAvailabilityRule {
  id: string;
  therapistId: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday ...
  isActive: boolean;
  startTime: string;
  endTime: string;
  slotDuration: number;
  cooldownGap: number;
  breaks: BreakPreference[];
}

export interface TherapistOverride {
  id: string;
  therapistId: string;
  date: string; // YYYY-MM-DD
  type: 'blocked' | 'available';
  startTime?: string;
  endTime?: string;
  slotDuration?: number;
  cooldownGap?: number;
  breaks?: BreakPreference[];
  reason?: string;
}

export interface Therapist {
  id: string;
  name: string;
  specialization: string;
  experience: string;
  bio: string;
  image: string;
  active: boolean;
  authId?: string;
  email?: string;
}

export type SessionType = 'Individual' | 'Couple' | 'Family' | 'Teen';