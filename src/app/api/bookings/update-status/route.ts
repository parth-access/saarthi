import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireTherapist } from '../../../../lib/auth/requireRole';
import { SessionLifecycleService } from '@/services/sessionLifecycleService';
import {
  firestoreBookingRepository,
  CancelBookingCommand,
  CancelBookingCommandHandler,
  AdminConfirmBookingCommand,
  AdminConfirmBookingCommandHandler,
  BookingStateMachine
} from '@/domains/booking';
import { BookingStatus } from '@/types';
import { OutboxService, OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';

const schema = z.object({
  bookingId: z.string(),
  status: z.string(),
  reason: z.string().optional()
});

export async function POST(req: Request) {
  try {
    const authResult = await requireTherapist(req);
    if (authResult instanceof NextResponse) return authResult;
    const session = authResult;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    
    const { bookingId, status, reason } = parsed.data;

    let therapistAuthId = '';
    if (session.role === 'therapist') {
       therapistAuthId = session.uid;
    }

    // Handle completed using SessionLifecycleService
    if (status === 'completed') {
      const result = await SessionLifecycleService.completeSession(bookingId, {
        uid: session.uid,
        role: session.role || 'therapist'
      });
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    // Handle no-show using SessionLifecycleService
    if (status === 'no_show') {
      const result = await SessionLifecycleService.markNoShow(bookingId, {
        uid: session.uid,
        role: session.role || 'therapist'
      }, reason || 'Student did not attend');
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    // Handle cancellation or rejection using CancelBookingCommand
    if (status === 'cancelled' || status === 'rejected') {
      const command = new CancelBookingCommand(
        bookingId,
        'Status updated by therapist/admin',
        session.uid,
        session.role
      );
      const handler = new CancelBookingCommandHandler();
      await handler.execute(command);
      return NextResponse.json({ success: true });
    }

    // Handle confirmation using AdminConfirmBookingCommand
    if (status === 'confirmed') {
      const command = new AdminConfirmBookingCommand(bookingId, {
        uid: session.uid,
        role: session.role,
      });
      const handler = new AdminConfirmBookingCommandHandler();
      await handler.execute(command);
      return NextResponse.json({ success: true });
    }

    const normTo = BookingStateMachine.normalizeStatus(status as BookingStatus);
    const camelTo = normTo.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
    const eventName = `Booking${camelTo.charAt(0).toUpperCase() + camelTo.slice(1)}`;
    const outboxEventId = generateDeterministicEventId('booking', bookingId, normTo);

    await adminDb.runTransaction(async (t) => {
      const data = await firestoreBookingRepository.findById(bookingId, t);
      if (!data) throw new Error('Booking not found');

      if (therapistAuthId) {
         const therapistDoc = await t.get(adminDb.collection('therapists').doc(data.therapistId));
         if (!therapistDoc.exists || therapistDoc.data()?.authId !== therapistAuthId) {
            throw new Error('Unauthorized to modify this booking');
         }
      }
      
      const previousStatus = data.status;
      BookingStateMachine.transition(data, status as BookingStatus, { skipEventBus: true });
      data.updatedAt = FieldValue.serverTimestamp();
      await firestoreBookingRepository.save(data, t);

      OutboxService.recordEventInTransaction(t, {
        id: outboxEventId,
        name: eventName,
        aggregateType: 'booking',
        aggregateId: bookingId,
        payload: {
          bookingId,
          booking: { ...data },
          previousStatus,
          targetStatus: status,
          metadata: {
            updatedBy: session.uid,
            role: session.role,
          }
        }
      });

      const auditRef = adminDb.collection('bookings').doc(bookingId).collection('audit_logs').doc();
      t.set(auditRef, {
        action: 'status_updated',
        status,
        timestamp: FieldValue.serverTimestamp(),
        details: `Booking status changed to ${status}`,
        userId: session.uid
      });
    });

    OutboxProcessor.processEvent(outboxEventId).catch((err) => {
      console.error('[UpdateStatus] Async outbox processing error:', err);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = (error instanceof Error ? error.message : String(error)).includes('not found') ? 'Booking not found' : 
                (error instanceof Error ? error.message : String(error)).includes('Unauthorized') ? 'Unauthorized' : 'Failed to update status';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
