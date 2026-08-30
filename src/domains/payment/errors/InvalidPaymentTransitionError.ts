import { AppError } from '@/shared/errors';

export class InvalidPaymentTransitionError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'INVALID_PAYMENT_TRANSITION', 400, true, metadata);
  }
}
