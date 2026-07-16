import { FirebaseTimestamp, BookingStatus, PaymentStatus } from '@/types';
import { BookingStateMachine } from '../state/BookingStateMachine';

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
  paymentVerifiedAt?: FirebaseTimestamp | Date | string | null | unknown;
  paymentLinkSentAt?: FirebaseTimestamp | Date | string | null | unknown;
  createdAt!: FirebaseTimestamp | Date | string | null | unknown;
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
  utcDateTime?: string;

  constructor(data: Partial<Booking>) {
    Object.assign(this, data);
    if (!this.status) {
      this.status = 'pending';
    }
  }

  // Transitions & state mutations
  lockSlot(): this {
    BookingStateMachine.transition(this, 'slot_locked');
    return this;
  }

  awaitPayment(): this {
    BookingStateMachine.transition(this, 'awaiting_payment');
    return this;
  }

  initiatePayment(): this {
    BookingStateMachine.transition(this, 'payment_initiated');
    return this;
  }

  confirmPayment(verifiedAt: Date | string | unknown, razorpayPaymentId?: string): this {
    BookingStateMachine.transition(this, 'confirmed');
    this.paymentStatus = 'paid';
    if (razorpayPaymentId) {
      this.razorpayPaymentId = razorpayPaymentId;
    }
    this.paymentVerifiedAt = verifiedAt;
    return this;
  }

  complete(): this {
    BookingStateMachine.transition(this, 'completed');
    return this;
  }

  cancel(reason?: string): this {
    BookingStateMachine.transition(this, 'cancelled');
    if (reason) {
      this.declineReason = reason;
    }
    return this;
  }

  decline(reason: string, declinedBy?: string, customNote?: string, timestamp?: unknown): this {
    BookingStateMachine.transition(this, 'rejected');
    this.declineReason = reason;
    this.declineCustomNote = customNote || '';
    if (declinedBy) {
      this.declinedBy = declinedBy;
    }
    this.declinedAt = timestamp || new Date();
    return this;
  }

  reschedule(newDate: string, newTime: string, rescheduledAt?: unknown, newUtcDateTime?: string): this {
    if (this.status === 'cancelled' || this.status === 'rejected' || this.status === 'completed') {
      throw new Error(`Cannot reschedule a ${this.status} booking`);
    }
    this.originalDate = this.date;
    this.originalTime = this.time;
    this.date = newDate;
    this.time = newTime;
    if (newUtcDateTime) {
      this.utcDateTime = newUtcDateTime;
    }
    this.rescheduledAt = rescheduledAt || new Date();
    return this;
  }
}
