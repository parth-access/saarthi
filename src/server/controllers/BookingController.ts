import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth/requireRole';
import { bookingSchema } from '../validators/bookingValidators';
import { BookingService } from '../services/BookingService';
import { logger } from '@/app/api/_lib/logger';

export class BookingController {
  
  static async createBooking(req: Request) {
    try {
      const authResult = await requireAuthenticated(req);
      if (authResult instanceof NextResponse) return authResult;
      const session = authResult;

      const body = await req.json();
      const parsed = bookingSchema.safeParse(body);
      
      if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
      }

      if (!session.email) {
        return NextResponse.json({ error: 'Verified email is required to book.' }, { status: 400 });
      }

      const { bookingId } = await BookingService.createBooking(parsed.data, session.uid, session.email);

      // Fire-and-forget notification
      try {
        const payload = { 
          type: 'booking-received', 
          bookingId, 
          therapistId: parsed.data.therapistId,
          bookingDetails: {
             name: parsed.data.name,
             email: session.email,
             phone: parsed.data.phone,
             date: parsed.data.date,
             time: parsed.data.time,
          }
        };
        const protocol = req.headers.get('x-forwarded-proto') || 'http';
        const host = req.headers.get('host');
        const origin = `${protocol}://${host}`;
        
        // Non-blocking fetch to internal email route
        fetch(`${origin}/api/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(err => logger.error("EMAIL", "Failed to send async email", err));
      } catch {}

      return NextResponse.json({ success: true, bookingId });
    } catch (error) {
       const msg = (error instanceof Error ? error.message : String(error)).includes("booked") || (error instanceof Error ? error.message : String(error)).includes("locked") 
                   ? (error instanceof Error ? error.message : String(error)) : "Failed to create booking";
       return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
  }
}
