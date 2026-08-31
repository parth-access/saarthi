import { FirebaseTimestamp, BookingStatus, PaymentStatus, RescheduleRecord } from '@/types';
import { BookingStateMachine, TransitionOptions } from '../state/BookingStateMachine';

export class Booking {
  id!: string;
  therapistId!: string;
  name!: string;
  email!: string;
  userId?: string;
  phone!: string;
  gender!: string;
  age?: number;
  date!: string;
  time!: string;
  sessionType!: string;
  message!: string;
  status!: BookingStatus;
  paymentStatus?: PaymentStatus;
  paymentId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  paymentAmount?: number;
  paymentCurrency?: string;
  holdExpiresAt?: FirebaseTimestamp | Date | string | null | unknown;
  paymentVerifiedAt?: FirebaseTimestamp | Date | string | null | unknown;
  paymentLinkSentAt?: FirebaseTimestamp | Date | string | null | unknown;
  createdAt!: FirebaseTimestamp | Date | string | null | unknown;
  updatedAt?: FirebaseTimestamp | Date | string | null | unknown;
  bookingToken?: string;
  sessionMode?: string;
  rescheduledAt?: FirebaseTimestamp | Date | string | null | unknown;
  originalDate?: string;
  originalTime?: string;
  rescheduleHistory?: RescheduleRecord[];
  emailStatus?: 'pending' | 'sent' | 'failed' | 'retrying';
  emailAttempts?: number;
  lastEmailAttemptAt?: FirebaseTimestamp | Date | string | null | unknown;
  lastEmailError?: string;
  cancellationOrRejectionReason?: string;
  declineReason?: string;
  declineCustomNote?: string;
  noShowReason?: string;
  declinedAt?: FirebaseTimestamp | Date | string | null | unknown;
  declinedBy?: string;
  invalidToken?: boolean;
  utcDateTime?: string;
  orderCreationInProgress?: boolean;
  orderCreationStartedAt?: FirebaseTimestamp | Date | number | string | null | unknown;
  googleCalendarEventId?: string;
  meetingUrl?: string;
  calendarStatus?: 'PENDING' | 'CREATED' | 'FAILED' | 'RETRY_REQUIRED' | 'CANCELLED';
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
  refundStatus?: 'refunded' | 'partial' | 'failed';
  refundId?: string;
  refundedAt?: FirebaseTimestamp | Date | string | null | unknown;
  /** Refunded amount in paise (booking-level visibility; the `refunds` collection is source of truth). */
  refundAmount?: number;

  constructor(data: Partial<Booking>) {
    Object.assign(this, data);
    if (!this.status) {
      this.status = 'pending';
    }
  }

  // Transitions & state mutations
  lockSlot(options?: TransitionOptions): this {
    BookingStateMachine.transition(this, 'slot_locked', options);
    return this;
  }

  awaitPayment(options?: TransitionOptions): this {
    BookingStateMachine.transition(this, 'awaiting_payment', options);
    return this;
  }

  initiatePayment(options?: TransitionOptions): this {
    BookingStateMachine.transition(this, 'payment_initiated', options);
    return this;
  }

  confirmPayment(
    verifiedAt: Date | string | FirebaseTimestamp | unknown,
    razorpayPaymentId?: string,
    options?: TransitionOptions
  ): this {
    // Check if conflicting payment ID is provided against an already confirmed booking
    if (razorpayPaymentId && this.razorpayPaymentId && this.razorpayPaymentId !== razorpayPaymentId) {
      throw new Error(`Booking already confirmed with payment ${this.razorpayPaymentId}`);
    }

    if (this.status === 'confirmed') {
      this.paymentStatus = 'paid';
      if (!this.razorpayPaymentId && razorpayPaymentId) {
        this.razorpayPaymentId = razorpayPaymentId;
      }
      if (!this.paymentVerifiedAt) {
        this.paymentVerifiedAt = verifiedAt;
      }
      return this;
    }

    // Must transition via state machine (will reject illegal states like cancelled/rejected/completed)
    BookingStateMachine.transition(this, 'confirmed', options);

    this.paymentStatus = 'paid';
    if (razorpayPaymentId) {
      this.razorpayPaymentId = razorpayPaymentId;
    }
    this.paymentVerifiedAt = verifiedAt;
    return this;
  }

  complete(options?: TransitionOptions): this {
    BookingStateMachine.transition(this, 'completed', options);
    return this;
  }

  cancel(reason?: string, options?: TransitionOptions): this {
    BookingStateMachine.transition(this, 'cancelled', options);
    if (reason) {
      this.cancellationOrRejectionReason = reason;
      this.declineReason = reason;
    }
    return this;
  }

  decline(reason: string, declinedBy?: string, customNote?: string, timestamp?: unknown, options?: TransitionOptions): this {
    BookingStateMachine.transition(this, 'rejected', options);
    this.cancellationOrRejectionReason = reason;
    this.declineReason = reason;
    this.declineCustomNote = customNote || '';
    if (declinedBy) {
      this.declinedBy = declinedBy;
    }
    this.declinedAt = timestamp || new Date();
    return this;
  }

  expire(options?: TransitionOptions): this {
    BookingStateMachine.transition(this, 'expired', options);
    return this;
  }

  failPayment(reason?: string, options?: TransitionOptions): this {
    this.paymentStatus = 'failed';
    if (this.status !== 'cancelled') {
      BookingStateMachine.transition(this, 'cancelled', options);
    }
    if (reason) {
      this.cancellationOrRejectionReason = reason;
      this.declineReason = reason;
    }
    return this;
  }

  markNoShow(reason?: string, options?: TransitionOptions): this {
    BookingStateMachine.transition(this, 'no_show', options);
    if (reason) {
      this.noShowReason = reason;
      this.cancellationOrRejectionReason = reason;
      this.declineReason = reason; // For backward compatibility with older UI queries
    }
    return this;
  }

  reschedule(newDate: string, newTime: string, rescheduledAt?: unknown, newUtcDateTime?: string, reason?: string): this {
    if (this.status === 'cancelled' || this.status === 'rejected' || this.status === 'completed') {
      throw new Error(`Cannot reschedule a ${this.status} booking`);
    }

    // Preserve the original appointment date/time audit trail permanently
    if (!this.originalDate) {
      this.originalDate = this.date;
    }
    if (!this.originalTime) {
      this.originalTime = this.time;
    }

    // Append to reschedule audit history
    if (!this.rescheduleHistory) {
      this.rescheduleHistory = [];
    }
    this.rescheduleHistory.push({
      previousDate: this.date,
      previousTime: this.time,
      newDate,
      newTime,
      rescheduledAt: rescheduledAt || new Date(),
      reason
    });

    this.date = newDate;
    this.time = newTime;
    if (newUtcDateTime) {
      this.utcDateTime = newUtcDateTime;
    }
    this.rescheduledAt = rescheduledAt || new Date();
    return this;
  }
}

