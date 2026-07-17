import { AppError } from '@/shared/errors';

export class InvalidBookingTransitionError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'INVALID_BOOKING_TRANSITION', 400, true, metadata);
  }
}
