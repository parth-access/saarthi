import { EventBus } from '@/shared/events/EventBus';

export type PaymentStatus = 'pending' | 'initiated' | 'success' | 'failed' | 'refunded';

const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['initiated', 'success', 'failed'],
  initiated: ['success', 'failed', 'pending'],
  success: ['refunded'],
  failed: ['initiated', 'success', 'pending'],
  refunded: []
};

export class PaymentStateMachine {
  static canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
    const allowed = VALID_TRANSITIONS[from] || [];
    return allowed.includes(to);
  }

  static transition(payment: { id: string; status: PaymentStatus }, targetStatus: PaymentStatus): void {
    const previousStatus = payment.status;
    if (!this.canTransition(previousStatus, targetStatus)) {
      throw new Error(`Cannot transition payment ${payment.id} from status '${payment.status}' to '${targetStatus}'`);
    }
    payment.status = targetStatus;

    const eventName = `Payment${targetStatus.charAt(0).toUpperCase() + targetStatus.slice(1)}`;
    try {
      EventBus.publish({
        name: eventName,
        timestamp: new Date(),
        payload: {
          paymentId: payment.id,
          payment,
          previousStatus,
          targetStatus
        }
      });
    } catch (err) {
      console.error('[PaymentStateMachine] Failed to publish event to central EventBus:', err);
    }
  }
}
