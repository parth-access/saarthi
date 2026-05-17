export interface User {
  uid: string;
  email: string;
  role: 'admin' | 'therapist';
}

export type BookingStatus =
  | 'pending'
  | 'pending_approval'
  | 'awaiting_payment'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'completed';

export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded';

export interface Booking {
  id: string;
  therapistId: string;
  name: string;
  email: string;
  phone: string;
  gender: string;
  age: number;
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
  paymentVerifiedAt?: any;
  paymentLinkSentAt?: any;
  createdAt: any;
  updatedAt?: any;
  bookingToken?: string;
  sessionMode?: string;
  rescheduledAt?: any;
  originalDate?: string;
  originalTime?: string;
  emailStatus?: 'pending' | 'sent' | 'failed' | 'retrying';
  emailAttempts?: number;
  lastEmailAttemptAt?: any;
  lastEmailError?: string;
  declineReason?: string;
  declineCustomNote?: string;
  declinedAt?: any;
  declinedBy?: string;
  invalidToken?: boolean;
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

export interface AvailabilityConfig {
  id: string;
  therapistId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
}

export type SessionType = 'Individual' | 'Couple' | 'Family' | 'Teen';