import { EventBus } from '@/shared/events/EventBus';
import { PaymentStatus } from '@/types';
import { InvalidPaymentTransitionError } from './errors/InvalidPaymentTransitionError';

export type { PaymentStatus };

const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  unpaid: ['pending', 'initiated', 'paid', 'success', 'failed'],
  pending: ['initiated', 'paid', 'success', 'failed'],
  initiated: ['paid', 'success', 'failed', 'pending'],
  paid: ['refunded'],
  success: ['refunded'],
  failed: ['initiated', 'pending', 'success'], // includes direct retry confirmation
  refunded: []
};

export interface PaymentTransitionOptions {
  skipEventBus?: boolean;
  metadata?: Record<string, unknown>;
}

export class PaymentStateMachine {
  static canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
    const allowed = VALID_TRANSITIONS[from] || [];
    return allowed.includes(to);
  }

  static transition(
    payment: { id: string; status: PaymentStatus },
    targetStatus: PaymentStatus,
    options?: PaymentTransitionOptions
  ): void {
    const previousStatus = payment.status;
    if (!this.canTransition(previousStatus, targetStatus)) {
      throw new InvalidPaymentTransitionError(
        `Cannot transition payment ${payment.id} from status '${payment.status}' to '${targetStatus}'`
      );
    }
    payment.status = targetStatus;

    if (!options?.skipEventBus) {
      const eventName = `Payment${targetStatus.charAt(0).toUpperCase() + targetStatus.slice(1)}`;
      try {
        EventBus.publish({
          name: eventName,
          timestamp: new Date(),
          payload: {
            paymentId: payment.id,
            payment,
            previousStatus,
            targetStatus,
            metadata: options?.metadata
          }
        }).catch((err) => {
          console.error(`[PaymentStateMachine] Async error in central EventBus for ${eventName}:`, err);
        });
      } catch (err) {
        console.error('[PaymentStateMachine] Failed to publish event to central EventBus:', err);
      }
    }
  }
}

