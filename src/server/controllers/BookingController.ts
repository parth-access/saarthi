import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/verifySession';
import { bookingSchema } from '../validators/bookingValidators';
import { BookingService } from '../services/BookingService';
import { logger } from '@/app/api/_lib/logger';
import { sendEmailAction } from '@/app/api/email/emailSender';
import crypto from 'crypto';

export class BookingController {
  
  static async createBooking(req: Request) {
    try {
      const session = await verifySession(req);
      const body = await req.json();
      const parsed = bookingSchema.safeParse(body);
      
      if (!parsed.success) {
        console.warn(`[DEBUG] booking creation validation failed: ${JSON.stringify(parsed.error.format())}`);
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
      }

      const email = session?.email || parsed.data.email;
      if (!email) {
        console.warn(`[DEBUG] booking creation failed: No email provided in session or request body`);
        return NextResponse.json({ error: 'Email is required to book.' }, { status: 400 });
      }

      const guestUserId = `guest_${crypto.randomUUID()}`;
      const uid = session?.uid || guestUserId;

      console.log(`[DEBUG] booking creation request: therapistId=${parsed.data.therapistId}, date=${parsed.data.date}, time=${parsed.data.time}, email=${email}, userId=${uid}`);

      const { bookingId } = await BookingService.createBooking(parsed.data, uid, email);

      console.log(`[DEBUG] booking creation success: bookingId=${bookingId}, email=${email}, userId=${uid}`);

      // Direct, awaited email notification
      try {
        console.log(`[DEBUG] calling sendEmailAction for bookingId=${bookingId}, recipient=${email}`);
        const emailResult = await sendEmailAction({
          type: 'booking-received',
          bookingId,
          therapistId: parsed.data.therapistId,
          bookingDetails: {
             name: parsed.data.name,
             email: email,
             phone: parsed.data.phone,
             date: parsed.data.date,
             time: parsed.data.time,
          }
        });
        console.log(`[DEBUG] sendEmailAction result: ${JSON.stringify(emailResult)}`);
      } catch (err) {
        console.error(`[DEBUG] Failed to send awaited booking received email`, err);
        logger.error("EMAIL", "Failed to send awaited booking received email", err);
      }

      return NextResponse.json({ success: true, bookingId });
    } catch (error) {
       console.error(`[DEBUG] booking creation caught error: ${error instanceof Error ? error.message : String(error)}`);
       const msg = (error instanceof Error ? error.message : String(error)).includes("booked") || (error instanceof Error ? error.message : String(error)).includes("locked") 
                   ? (error instanceof Error ? error.message : String(error)) : "Failed to create booking";
       return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
  }
}
