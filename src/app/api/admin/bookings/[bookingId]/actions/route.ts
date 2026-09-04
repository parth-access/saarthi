import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import {
  AdminConfirmBookingCommand,
  AdminConfirmBookingCommandHandler,
  CancelBookingCommand,
  CancelBookingCommandHandler,
  RescheduleBookingCommand,
  RescheduleBookingCommandHandler,
} from '@/domains/booking';
import { SessionLifecycleService } from '@/services/sessionLifecycleService';
import { logger } from '../../../../_lib/logger';
import { checkRateLimit } from '../../../../_lib/rateLimit';
import { isReadableBookingId } from '../bookingIdGuard';
import {
  ActionSummary,
  adminBookingActionSchema,
  classifyActionError,
  describeCancel,
  describeConfirm,
  describeLifecycle,
  describeReschedule,
} from './adminBookingAction';

export const dynamic = 'force-dynamic';

/**
 * The five operations an admin can perform on a booking.
 *
 * Every branch delegates to the command handler the rest of the platform already
 * uses. Nothing here re-implements a transaction, re-derives a refund percent, or
 * writes to `bookings` directly — which is the point: the therapist dashboard,
 * the client's manage-booking link and this console must produce identical
 * outcomes, and they do so by sharing one implementation rather than three that
 * agree today.
 *
 * Three properties are load-bearing and easy to lose in a later edit:
 *
 *  - **The response reports what happened, not what was asked for.** Each handler
 *    has an idempotent no-op path — already confirmed, already settled, already
 *    completed — and reports it in its result rather than by throwing. The
 *    `describe*` functions turn that result into the operator's copy, and a no-op
 *    comes back with `changed: false` so the UI can refuse to call it a success.
 *
 *  - **Authorization is the handler's, not this route's.** `requireAdmin` decides
 *    who may reach this endpoint; the handlers independently re-check ownership
 *    and state on every call, inside their transactions. Removing a button from
 *    the UI secures nothing, and neither would removing a branch from here.
 *
 *  - **Errors are classified from an allowlist.** The handlers throw plain
 *    `Error`s written for developers, and the Firestore ones name the project and
 *    carry console URLs. Anything unrecognised becomes a generic 500 with the
 *    real cause in the server log. See `adminBookingAction.ts`.
 *
 * The successful response deliberately does not include the updated booking. The
 * client refetches the detail endpoint, so the screen shows persisted state read
 * back from Firestore rather than an optimistic guess assembled here — and the
 * post-commit calendar and email work means the two are not always the same.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ bookingId: string }> }
) {
  // Auth precedes the rate limit on purpose. The limiter is keyed by IP, so
  // checking it first would let unauthenticated traffic exhaust the bucket an
  // operator needs; this way only verified admins consume it.
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;
  const session = authorized;

  const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
  // Higher than the client-facing routes' 10: an operator working through a
  // morning's queue legitimately performs many actions in a minute. It is a
  // guard against a stuck retry loop, not against an admin doing their job.
  const rateCheck = checkRateLimit(clientIp, 'admin_booking_action', 30, 60000);
  if (!rateCheck.success) {
    return NextResponse.json(
      { success: false, error: 'Too many actions in a short time. Wait a moment and try again.' },
      { status: 429 }
    );
  }

  const { bookingId } = await context.params;
  if (!isReadableBookingId(bookingId)) {
    return NextResponse.json({ success: false, error: 'That is not a valid booking id.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'The request body was not valid JSON.' }, { status: 400 });
  }

  const parsed = adminBookingActionSchema.safeParse(body);
  if (!parsed.success) {
    // The first message rather than the whole tree: these are authored strings
    // ("Give a reason of at least 3 characters"), and one clear sentence is more
    // use to an operator than a nested error object. The full tree is logged.
    const first = parsed.error.issues[0];
    logger.warn('BOOKING', 'Admin booking action rejected as malformed', {
      bookingId,
      adminUid: session.uid,
      issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    });
    return NextResponse.json(
      { success: false, error: first?.message ?? 'That action is not one this endpoint accepts.' },
      { status: 400 }
    );
  }

  const command = parsed.data;
  const actor = { uid: session.uid, role: 'admin' as const };

  try {
    let result: ActionSummary;

    switch (command.action) {
      case 'confirm': {
        const outcome = await new AdminConfirmBookingCommandHandler().execute(
          new AdminConfirmBookingCommand(bookingId, actor)
        );
        result = describeConfirm(outcome);
        break;
      }

      case 'cancel': {
        // `cancelledBy` is the admin's uid, which is what lands in the audit
        // trail. The handler decides cancel-vs-decline from the booking's own
        // status, so this route does not choose between them.
        const outcome = await new CancelBookingCommandHandler().execute(
          new CancelBookingCommand(bookingId, command.reason, session.uid, 'admin', command.note)
        );
        result = describeCancel(outcome);
        break;
      }

      case 'complete':
      case 'no_show': {
        // The one pair that reports refusals by returning `{ success: false }`
        // instead of throwing, so the failure path is here rather than in catch.
        const outcome =
          command.action === 'complete'
            ? await SessionLifecycleService.completeSession(bookingId, actor)
            : await SessionLifecycleService.markNoShow(
                bookingId,
                actor,
                command.reason || undefined
              );

        if (!outcome.success) {
          const classified = classifyActionError(outcome.error ?? '');
          if (classified.generic) {
            logger.error('BOOKING', 'Admin session lifecycle action failed', outcome.error, {
              bookingId,
              action: command.action,
              adminUid: session.uid,
            });
          }
          return NextResponse.json(
            { success: false, error: classified.message },
            { status: classified.status }
          );
        }

        result = describeLifecycle(command.action, outcome);
        break;
      }

      case 'reschedule': {
        const booking = await new RescheduleBookingCommandHandler().execute(
          new RescheduleBookingCommand(bookingId, command.date, command.time, {
            uid: session.uid,
            email: session.email,
            role: 'admin',
          })
        );

        // The handler returns the mutated entity, so `date`/`time` are already
        // the new ones. The slot it came from is read back from the history entry
        // the domain appended rather than from the request, so the summary states
        // what was recorded rather than what this route assumed.
        const history = booking.rescheduleHistory ?? [];
        const latest = history[history.length - 1];
        result = describeReschedule({
          date: booking.date,
          time: booking.time,
          previousDate: latest?.previousDate ?? 'its previous date',
          previousTime: latest?.previousTime ?? 'its previous time',
        });
        break;
      }
    }

    logger.info('BOOKING', 'Admin booking action applied', {
      bookingId,
      action: command.action,
      adminUid: session.uid,
      changed: result.changed,
    });

    return NextResponse.json(
      { success: true, action: command.action, ...result },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    const classified = classifyActionError(error);

    // Recognised refusals are expected operator traffic and log at warn; anything
    // unrecognised is the one case where the real cause is only in the log, so it
    // logs the error object in full.
    if (classified.generic) {
      logger.error('BOOKING', 'Admin booking action failed', error, {
        bookingId,
        action: command.action,
        adminUid: session.uid,
      });
    } else {
      logger.warn('BOOKING', 'Admin booking action refused', {
        bookingId,
        action: command.action,
        adminUid: session.uid,
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    return NextResponse.json(
      { success: false, error: classified.message },
      { status: classified.status }
    );
  }
}
