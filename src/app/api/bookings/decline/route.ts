import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTherapist } from '../../../../lib/auth/requireRole';
import { CancelBookingCommand, CancelBookingCommandHandler } from '@/domains/booking';

const schema = z.object({
  bookingId: z.string(),
  reason: z.string(),
  customNote: z.string().optional()
});

export async function POST(req: Request) {
  try {
    const authResult = await requireTherapist(req);
    if (authResult instanceof NextResponse) return authResult;
    const session = authResult;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    
    const { bookingId, reason, customNote } = parsed.data;

    const command = new CancelBookingCommand(bookingId, reason, session.uid, session.role, customNote);
    const handler = new CancelBookingCommandHandler();
    await handler.execute(command);

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = (error instanceof Error ? error.message : String(error)).includes('not found') ? 'Booking not found' : 
                (error instanceof Error ? error.message : String(error)).includes('Unauthorized') ? 'Unauthorized' : 'Failed to decline booking';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
