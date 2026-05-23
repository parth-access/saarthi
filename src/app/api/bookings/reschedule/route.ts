import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTherapist } from '../../../../lib/auth/requireRole';
import { BookingService } from '@/server/services/BookingService';

const schema = z.object({
  bookingId: z.string(),
  newDate: z.string(),
  newTime: z.string()
});

export async function POST(req: Request) {
  try {
    const authResult = await requireTherapist(req);
    if (authResult instanceof NextResponse) return authResult;
    const session = authResult;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    
    const { bookingId, newDate, newTime } = parsed.data;

    const bookingData = await BookingService.rescheduleBooking(bookingId, newDate, newTime, {
      uid: session.uid,
      role: session.role
    });

    const therapistId = bookingData.therapistId;

    try {
        const protocol = req.headers.get('x-forwarded-proto') || 'http';
        const host = req.headers.get('host');
        const origin = `${protocol}://${host}`;
        
        try {
          await fetch(`${origin}/api/email`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': req.headers.get('Authorization') || '' 
            },
            body: JSON.stringify({ 
              type: 'booking-rescheduled', 
              bookingId, 
              therapistId,
              bookingDetails: {
                  name: bookingData.name,
                  email: bookingData.email,
                  phone: bookingData.phone,
                  date: newDate,
                  time: newTime,
                  originalDate: bookingData.date,
                  originalTime: bookingData.time,
                  sessionMode: bookingData.sessionMode,
                  bookingToken: bookingData.bookingToken,
              }
            })
          });
        } catch(err) {
          console.error('Failed to send reschedule email:', err);
        }
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = (error instanceof Error ? error.message : String(error)).includes("unavailable") ? "This new slot is unavailable." :
                (error instanceof Error ? error.message : String(error)).includes("booked") ? "This new slot is already booked." :
                (error instanceof Error ? error.message : String(error)).includes("Unauthorized") ? "Unauthorized" :
                "Failed to reschedule booking";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
