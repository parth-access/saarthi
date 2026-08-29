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

const VALID_BOOKING_STATUSES = [
  'pending',
  'pending_approval',
  'awaiting_payment',
  'pending_payment',
  'confirmed',
  'rejected',
  'cancelled',
  'completed',
  'draft',
  'locked',
  'slot_locked',
  'payment_initiated',
  'payment_started',
  'rescheduled',
  'expired',
  'no_show',
] as const;

const STATUS_EVENT_NAMES: Record<string, string> = {
  draft: 'BookingDraft',
  awaiting_payment: 'BookingAwaitingPayment',
  pending_payment: 'BookingPendingPayment',
  pending: 'BookingPending',
  pending_approval: 'BookingPendingApproval',
  confirmed: 'BookingConfirmed',
  rescheduled: 'BookingRescheduled',
  completed: 'BookingCompleted',
  no_show: 'BookingNoShow',
  cancelled: 'BookingCancelled',
  rejected: 'BookingRejected',
  locked: 'BookingSlotLocked',
  slot_locked: 'BookingSlotLocked',
  payment_initiated: 'BookingPaymentInitiated',
  payment_started: 'BookingPaymentInitiated',
  expired: 'BookingExpired'
};

const schema = z.object({
  bookingId: z.string().min(1, 'Booking ID is required'),
  status: z.enum(VALID_BOOKING_STATUSES),
  reason: z.string().optional(),
  customNote: z.string().optional()
});

function getErrorResponse(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('Unauthorized') || msg.includes('Forbidden')) {
    return NextResponse.json({ success: false, error: msg }, { status: 403 });
  }
  if (msg.toLowerCase().includes('not found')) {
    return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
  }
  return NextResponse.json({ success: false, error: msg || 'Failed to update status' }, { status: 400 });
}

export async function POST(req: Request) {
  try {
    const authResult = await requireTherapist(req);
    if (authResult instanceof NextResponse) return authResult;
    const session = authResult;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.format() }, { status: 400 });
    }
    
    const { bookingId, status, reason, customNote } = parsed.data;

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
        const isAuth = result.error?.includes('Unauthorized') || result.error?.includes('Forbidden');
        return NextResponse.json({ success: false, error: result.error }, { status: isAuth ? 403 : 400 });
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
        const isAuth = result.error?.includes('Unauthorized') || result.error?.includes('Forbidden');
        return NextResponse.json({ success: false, error: result.error }, { status: isAuth ? 403 : 400 });
      }
      return NextResponse.json(result);
    }

    // Handle cancellation or rejection using CancelBookingCommand with reason and customNote
    if (status === 'cancelled' || status === 'rejected') {
      const command = new CancelBookingCommand(
        bookingId,
        reason || 'Status updated by therapist/admin',
        session.uid,
        session.role,
        customNote
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
    const eventName = STATUS_EVENT_NAMES[normTo] || `Booking${normTo.charAt(0).toUpperCase() + normTo.slice(1)}`;
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

      // Trim sensitive user PII from outbox event payload
      OutboxService.recordEventInTransaction(t, {
        id: outboxEventId,
        name: eventName,
        aggregateType: 'booking',
        aggregateId: bookingId,
        payload: {
          bookingId,
          targetStatus: status,
          previousStatus,
          therapistId: data.therapistId,
          date: data.date,
          time: data.time,
          sessionType: data.sessionType,
          metadata: {
            updatedBy: session.uid,
            role: session.role,
            reason: reason || undefined
          }
        }
      });

      const auditRef = adminDb.collection('bookings').doc(bookingId).collection('audit_logs').doc();
      t.set(auditRef, {
        action: 'status_updated',
        status,
        timestamp: FieldValue.serverTimestamp(),
        details: reason ? `Booking status changed to ${status}: ${reason}` : `Booking status changed to ${status}`,
        userId: session.uid
      });
    });

    OutboxProcessor.processEvent(outboxEventId).catch((err) => {
      console.error('[UpdateStatus] Async outbox processing error:', err);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return getErrorResponse(error);
  }
}
