export type SessionMode = 'Online' | 'In-Person' | 'online' | 'in_person';

export interface Booking {
  id: string;
  name: string;
  email: string;
  phone?: string;
  age?: number;
  gender?: string;
  occupation?: string;
  concern?: string;
  previousTherapy?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  date: string;
  time: string;
  therapistId: string;
  therapistName?: string;
  sessionMode: SessionMode;
  sessionType?: string;
  status: 'draft' | 'pending_payment' | 'confirmed' | 'completed' | 'cancelled' | 'rejected' | 'expired';
  paymentStatus: 'pending' | 'unpaid' | 'paid' | 'failed' | 'refunded';
  paymentAmount?: number;
  paymentCurrency?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  bookingToken?: string;
  userId?: string;
  meetingUrl?: string;
  calendarEventId?: string;
  calendarStatus?: 'PENDING' | 'CREATED' | 'FAILED' | 'SKIPPED';
  calendarError?: string | null;
  reminderStatus?: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  reminderSentAt?: any;
  studentReminderSentAt?: any;
  therapistReminderSentAt?: any;
  reminderScheduledFor?: any;
  reminderError?: string | null;
  holdExpiresAt?: any;
  createdAt?: any;
  updatedAt?: any;
  declineReason?: string;
  declineCustomNote?: string;
  declinedBy?: 'therapist' | 'admin';
}

export interface Therapist {
  id: string;
  name: string;
  title: string;
  specialization: string[];
  experience: string;
  languages: string[];
  bio: string;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  hourlyRate: number;
  availableDays: string[];
  availableSlots: string[];
  education: string;
  email?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: 'student' | 'therapist' | 'admin';
  phone?: string;
  createdAt?: any;
}
