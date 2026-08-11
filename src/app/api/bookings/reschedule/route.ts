import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTherapist } from '@/lib/auth/requireRole';
import { RescheduleBookingCommand, RescheduleBookingCommandHandler } from '@/domains/booking';
import { sendEmailAction } from '@/app/api/email/emailSender';

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

    const command = new RescheduleBookingCommand(bookingId, newDate, newTime, {
      uid: session.uid,
      role: session.role
    });
    const handler = new RescheduleBookingCommandHandler();
    const bookingData = await handler.execute(command);

    const therapistId = bookingData.therapistId;

    try {
      await sendEmailAction({ 
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
      });
    } catch(err) {
      console.error('Failed to send reschedule email:', err);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = (error instanceof Error ? error.message : String(error)).includes("unavailable") ? "This new slot is unavailable." :
                (error instanceof Error ? error.message : String(error)).includes("booked") ? "This new slot is already booked." :
                (error instanceof Error ? error.message : String(error)).includes("Unauthorized") ? "Unauthorized" :
                "Failed to reschedule booking";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
