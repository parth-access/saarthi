import { PaymentStatus, PaymentStateMachine } from './PaymentStateMachine';

export class Payment {
  id!: string; // Usually represents razorpayOrderId or a unique transaction ID
  bookingId!: string;
  therapistId!: string;
  patientEmail?: string;
  amount!: number;
  currency!: string;
  razorpayOrderId!: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  status!: PaymentStatus;
  source?: string;
  createdAt!: Date | string | unknown;
  verifiedAt?: Date | string | unknown;
  refundedAt?: Date | string | unknown;

  constructor(data: Partial<Payment>) {
    Object.assign(this, data);
    if (!this.status) {
      this.status = 'pending';
    }
  }

  initiate(): this {
    PaymentStateMachine.transition(this, 'initiated');
    return this;
  }

  confirm(verifiedAt: Date | string | unknown, paymentId: string, signature?: string, source?: string): this {
    PaymentStateMachine.transition(this, 'success');
    this.razorpayPaymentId = paymentId;
    if (signature) {
      this.razorpaySignature = signature;
    }
    if (source) {
      this.source = source;
    }
    this.verifiedAt = verifiedAt || new Date();
    return this;
  }

  fail(): this {
    PaymentStateMachine.transition(this, 'failed');
    return this;
  }

  refund(refundedAt?: Date | string | unknown): this {
    PaymentStateMachine.transition(this, 'refunded');
    this.refundedAt = refundedAt || new Date();
    return this;
  }
}
