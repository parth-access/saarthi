/**
 * The clients screen's display rules — specifically the ones that phrase a derived
 * figure honestly.
 *
 * Badges, amounts, IST dates and status labels come from the shared booking
 * presentation, so a client's history badges a booking exactly as the Bookings
 * list does. What is here is the handful of phrasings this screen invents, each
 * because getting it wrong would quietly overstate what the data supports:
 *
 *  - a paid total built from payments that carry no amount is a **lower bound**,
 *    and must read as `≥ ₹X`, not `₹X` — the same "≥" the refunds triage uses.
 *  - "upcoming" is a count of future confirmed sessions; sessions that could not be
 *    placed in time are **stated separately**, never folded in or dropped.
 *  - a divergent name or phone across one email is a **signal worth surfacing**,
 *    because it is how a shared inbox or a typo-split history shows itself.
 */
import type { ClientIdentity, ClientMoney } from '@/domains/admin/clientProfile';
import { formatAmount } from '../bookings/adminBookingPresentation';
import { formatRefundAmount } from '../bookings/adminBookingDetailPresentation';

/**
 * The lifetime paid figure. `isFloor` is true when at least one captured payment
 * carried no amount, so the number is a lower bound: the screen shows `≥` and the
 * caveat rather than a total it cannot stand behind.
 */
export function formatPaidTotal(money: ClientMoney): {
  readonly text: string;
  readonly isFloor: boolean;
  readonly caveat: string | null;
} {
  const base = formatAmount(money.paidRupees, 'INR');
  const isFloor = money.unpricedPaidCount > 0;
  return {
    text: isFloor ? `≥ ${base}` : base,
    isFloor,
    caveat: isFloor
      ? `${money.unpricedPaidCount} captured ${
          money.unpricedPaidCount === 1 ? 'payment has' : 'payments have'
        } no amount recorded, so this is a lower bound.`
      : null,
  };
}

/** The refund figure, from paise. Shown only when the client has any refund. */
export function formatRefundTotal(money: ClientMoney): string {
  return formatRefundAmount(money.refundedPaise);
}

/**
 * "Upcoming" as a headline plus, when needed, an explicit note that some confirmed
 * sessions have no resolvable instant — so a client with a confirmed-but-undated
 * session is never silently counted as having nothing ahead.
 */
export function describeUpcoming(upcoming: {
  readonly count: number;
  readonly unplaceable: number;
}): { readonly text: string; readonly note: string | null } {
  return {
    text: upcoming.count === 0 ? 'None upcoming' : `${upcoming.count} upcoming`,
    note:
      upcoming.unplaceable > 0
        ? `${upcoming.unplaceable} confirmed ${
            upcoming.unplaceable === 1 ? 'session' : 'sessions'
          } could not be placed in time.`
        : null,
  };
}

/**
 * Signals that one email may not be one person, or has changed details. Each is a
 * plain statement of what was observed, not a conclusion drawn from it.
 */
export function identityNotes(identity: ClientIdentity): readonly string[] {
  const notes: string[] = [];
  if (identity.nameVaried) notes.push('More than one name appears on this email.');
  if (identity.phoneVaried) notes.push('More than one phone number appears on this email.');
  if (identity.userIds.length > 1) {
    notes.push(`Linked to ${identity.userIds.length} different accounts.`);
  }
  return notes;
}
