import { verifySession } from '@/lib/auth/verifySession';
import { bookingSchema } from '../validators/bookingValidators';
import { sendEmailAction } from '@/app/api/email/emailSender';
import { IdGenerator } from '@/shared/ids';
import { logger } from '@/shared/logger';
import { auditService } from '@/domains/audit/AuditService';
import { successResponse, errorResponse } from '@/shared/responses';
import { ValidationError, AppError } from '@/shared/errors';
import crypto from 'crypto';
import { CreateBookingCommand, CreateBookingCommandHandler } from '@/domains/booking';

export class BookingController {
  static async createBooking(req: Request) {
    const requestId = IdGenerator.request();
    const reqLogger = logger.withContext({ requestId, route: '/api/bookings/create' });
    
    try {
      const session = await verifySession(req);
      const body = await req.json();
      const parsed = bookingSchema.safeParse(body);
      
      if (!parsed.success) {
        throw new ValidationError('Validation failed', { details: parsed.error.format() });
      }
      
      const email = session?.email || parsed.data.email;
      if (!email) {
        throw new ValidationError('Email is required to book.');
      }
      
      const guestUserId = `guest_${crypto.randomUUID()}`;
      const uid = session?.uid || guestUserId;
      
      reqLogger.info('Booking creation requested', { therapistId: parsed.data.therapistId, date: parsed.data.date, time: parsed.data.time, userId: uid });
      
      const command = new CreateBookingCommand(parsed.data, uid, email);
      const handler = new CreateBookingCommandHandler();
      const { bookingId } = await handler.execute(command);
      
      reqLogger.info('Booking created successfully', { bookingId, userId: uid });
      
      await auditService.logEvent(
        'BOOKING_CREATED',
        { therapistId: parsed.data.therapistId, date: parsed.data.date, time: parsed.data.time, requestId, userId: uid },
        session?.uid ? 'customer' : 'system',
        bookingId
      );

      // Direct, awaited email notification
      try {
        reqLogger.info('Sending payment link email', { bookingId });
        await sendEmailAction({
          type: 'booking-payment-link',
          bookingId,
          therapistId: parsed.data.therapistId,
        });
        
        await auditService.logEvent(
          'PAYMENT_LINK_SENT',
          { requestId, userId: uid },
          'system',
          bookingId
        );
      } catch (err) {
        reqLogger.error('Failed to send awaited booking payment link email', { error: err, bookingId });
        await auditService.logEvent(
          'EMAIL_FAILED',
          { error: err instanceof Error ? err.message : String(err), requestId, userId: uid },
          'system',
          bookingId
        );
      }

      return successResponse({ bookingId }, {}, requestId);
    } catch (error) {
      reqLogger.error('Booking creation caught error', error);
      
      // Map domain errors to AppErrors
      let mappedError = error;
      if (!(error instanceof AppError)) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('booked') || msg.includes('locked')) {
          mappedError = new AppError(msg, 'SLOT_UNAVAILABLE', 400);
        } else {
          mappedError = new AppError('Failed to create booking', 'INTERNAL_ERROR', 500);
        }
      }
      
      return errorResponse(mappedError, requestId);
    }
  }
}
