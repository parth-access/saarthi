/**
 * Firestore security-rules suite.
 *
 * Server code uses the Admin SDK, which bypasses these rules, so what is tested
 * here is exactly the direct client-SDK surface: what a signed-out visitor, a
 * client, a therapist and an admin can read or write with their own ID token.
 * The dashboard relies on these rules for ownership ("a client sees only their
 * own bookings"), so each collection carries at least one allow and one deny.
 *
 * Run with `npm run test:rules` (starts the Firestore emulator).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'demo-saarthi-rules';

let env: RulesTestEnvironment;

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

const ALICE = { uid: 'alice', email: 'alice@example.com' };
const BOB = { uid: 'bob', email: 'bob@example.com' };
const THERAPIST = { uid: 'thera-uid', email: 'thera@example.com', therapistId: 't1' };
const OTHER_THERAPIST = { uid: 'thera2-uid', email: 'thera2@example.com', therapistId: 't2' };
const ADMIN = { uid: 'admin', email: 'admin@example.com' };
const DISABLED = { uid: 'disabled', email: 'disabled@example.com' };

function signedIn(user: { uid: string; email: string }, emailVerified = true): Firestore {
  return env
    .authenticatedContext(user.uid, { email: user.email, email_verified: emailVerified })
    .firestore() as unknown as Firestore;
}

const anon = (): Firestore => env.unauthenticatedContext().firestore() as unknown as Firestore;
const alice = () => signedIn(ALICE);
const bob = () => signedIn(BOB);
const therapist = () => signedIn(THERAPIST);
const otherTherapist = () => signedIn(OTHER_THERAPIST);
const admin = () => signedIn(ADMIN);
const disabled = () => signedIn(DISABLED);

// ---------------------------------------------------------------------------
// Seed data (written with rules disabled, i.e. as the Admin SDK would)
// ---------------------------------------------------------------------------

const BOOKING_FIELDS = {
  therapistId: THERAPIST.therapistId,
  price: 1500,
  paymentStatus: 'pending',
  status: 'pending_payment',
  manageToken: 'secret-manage-token',
};

async function seed(): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    const put = (path: string, data: Record<string, unknown>) => setDoc(doc(db, path), data);

    await put('users/alice', { uid: 'alice', name: 'Alice', email: ALICE.email, role: 'client' });
    await put('users/bob', { uid: 'bob', name: 'Bob', email: BOB.email, role: 'client' });
    await put('users/thera-uid', { uid: THERAPIST.uid, email: THERAPIST.email, role: 'therapist' });
    await put('users/thera2-uid', { uid: OTHER_THERAPIST.uid, email: OTHER_THERAPIST.email, role: 'therapist' });
    await put('users/admin', { uid: 'admin', email: ADMIN.email, role: 'admin' });
    await put('users/disabled', { uid: 'disabled', email: DISABLED.email, role: 'client', accountDisabled: true });

    await put('therapists/t1', { name: 'Dr. One', authId: THERAPIST.uid, price: 1500, active: true });
    await put('therapists/t2', { name: 'Dr. Two', authId: OTHER_THERAPIST.uid, price: 2000, active: true });

    await put('bookings/b-alice', { ...BOOKING_FIELDS, userId: ALICE.uid, email: ALICE.email });
    await put('bookings/b-alice-guest', { ...BOOKING_FIELDS, userId: null, email: ALICE.email });
    await put('bookings/b-bob', { ...BOOKING_FIELDS, userId: BOB.uid, email: BOB.email });
    await put('bookings/b-alice/audit_logs/a1', { action: 'created' });
    await put('bookings/b-bob/audit_logs/a1', { action: 'created' });

    await put('payments/p-alice', { bookingId: 'b-alice', patientEmail: ALICE.email, amount: 1500, status: 'captured' });

    await put('reschedule_requests/r-alice', {
      userId: ALICE.uid,
      bookingId: 'b-alice',
      therapistId: THERAPIST.therapistId,
      reason: 'clash',
      status: 'pending',
    });
    await put('reschedule_requests/r-bob', {
      userId: BOB.uid,
      bookingId: 'b-bob',
      therapistId: OTHER_THERAPIST.therapistId,
      reason: 'travel',
      status: 'pending',
    });

    await put('contacts/c1', { name: 'Visitor', message: 'hello' });
    await put('therapist_reconnect_requests/x1', { userId: ALICE.uid, therapistId: 't1' });
    await put('locked_slots/s1', { holderUid: BOB.uid, lockId: 'lock-1' });
    await put('availability_rules/ar1', { therapistId: 't1', day: 1 });
    await put('therapistAvailability/t1', { timezone: 'Asia/Kolkata' });
    await put('therapistAvailability/t1/recurringRules/rr1', { day: 1, start: '09:00', end: '17:00' });
    await put('therapistAvailability/t1/overrides/o1', { date: '2026-12-01', closed: true });
    await put('session_notes/n1', { bookingId: 'b-alice', note: 'private clinical note' });
  });
}

/** Demote the t1 therapist to a client the way the admin console does, leaving therapists/t1.authId in place. */
async function demoteTherapist(): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore() as unknown as Firestore, 'users/thera-uid'), { role: 'client' });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

afterAll(async () => {
  await env?.cleanup();
});

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

describe('users', () => {
  it('signed out: cannot read or create a profile', async () => {
    await assertFails(getDoc(doc(anon(), 'users/alice')));
    await assertFails(setDoc(doc(anon(), 'users/new'), { name: 'x' }));
  });

  it('client: reads own profile, not someone else’s', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
    await assertFails(getDoc(doc(alice(), 'users/bob')));
    await assertFails(getDocs(collection(alice(), 'users')));
  });

  it('client: creates own profile as a client only', async () => {
    const newbie = signedIn({ uid: 'newbie', email: 'newbie@example.com' });
    await assertFails(setDoc(doc(newbie, 'users/newbie'), { name: 'N', role: 'admin' }));
    await assertFails(setDoc(doc(newbie, 'users/newbie'), { name: 'N', role: 'therapist' }));
    await assertFails(setDoc(doc(newbie, 'users/someone-else'), { name: 'N', role: 'client' }));
    await assertSucceeds(setDoc(doc(newbie, 'users/newbie'), { name: 'N', email: 'newbie@example.com', role: 'client' }));
  });

  it('client: edits allowed profile fields on own doc only', async () => {
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { name: 'Alice B', phone: '123', bio: 'hi' }));
    await assertFails(updateDoc(doc(alice(), 'users/bob'), { name: 'pwned' }));
  });

  it('client: can never write role, revocation or disable flags on own doc', async () => {
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { role: 'admin' }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { sessionRevokeBefore: 0 }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { accountDisabled: false }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { totalSessions: 99 }));
  });

  it('client: profile email must match the token email', async () => {
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { email: 'bob@example.com' }));
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { email: ALICE.email }));
  });

  it('client: cannot delete a profile, own or other', async () => {
    await assertFails(deleteDoc(doc(alice(), 'users/alice')));
  });

  it('therapist: reads own user doc, not a client’s', async () => {
    await assertSucceeds(getDoc(doc(therapist(), 'users/thera-uid')));
    await assertFails(getDoc(doc(therapist(), 'users/alice')));
  });

  it('admin: reads any profile, edits non-authority fields, deletes', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'users/alice')));
    await assertSucceeds(getDocs(collection(admin(), 'users')));
    await assertSucceeds(updateDoc(doc(admin(), 'users/alice'), { name: 'Renamed by admin' }));
    await assertSucceeds(deleteDoc(doc(admin(), 'users/bob')));
  });

  it('admin: authority fields go through the server, never the client SDK', async () => {
    await assertFails(updateDoc(doc(admin(), 'users/alice'), { role: 'admin' }));
    await assertFails(updateDoc(doc(admin(), 'users/alice'), { accountDisabled: true }));
    await assertFails(updateDoc(doc(admin(), 'users/alice'), { sessionRevokeBefore: 1 }));
  });

  it('disabled account: is treated as signed out, even for its own doc', async () => {
    await assertFails(getDoc(doc(disabled(), 'users/disabled')));
  });
});

// ---------------------------------------------------------------------------
// therapists
// ---------------------------------------------------------------------------

describe('therapists', () => {
  it('anyone, signed out included, can read the directory', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'therapists/t1')));
    await assertSucceeds(getDocs(query(collection(anon(), 'therapists'), where('active', '==', true))));
  });

  it('signed out and clients cannot write therapist docs', async () => {
    await assertFails(updateDoc(doc(anon(), 'therapists/t1'), { price: 1 }));
    await assertFails(updateDoc(doc(alice(), 'therapists/t1'), { price: 1 }));
    await assertFails(setDoc(doc(alice(), 'therapists/fake'), { name: 'Fake', authId: ALICE.uid }));
  });

  it('therapist cannot change their own price, profile or archive flag', async () => {
    await assertFails(updateDoc(doc(therapist(), 'therapists/t1'), { price: 99999 }));
    await assertFails(updateDoc(doc(therapist(), 'therapists/t1'), { active: false }));
    await assertFails(deleteDoc(doc(therapist(), 'therapists/t1')));
  });

  it('admin can create, update and delete therapist docs', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'therapists/t3'), { name: 'Dr. Three', price: 1000 }));
    await assertSucceeds(updateDoc(doc(admin(), 'therapists/t1'), { price: 1800 }));
    await assertSucceeds(deleteDoc(doc(admin(), 'therapists/t3')));
  });
});

// ---------------------------------------------------------------------------
// bookings (and receipts, which are derived from them)
// ---------------------------------------------------------------------------

describe('bookings', () => {
  it('signed out: no read, no list, no write', async () => {
    await assertFails(getDoc(doc(anon(), 'bookings/b-alice')));
    await assertFails(getDocs(collection(anon(), 'bookings')));
    await assertFails(setDoc(doc(anon(), 'bookings/new'), { ...BOOKING_FIELDS, email: 'x@example.com' }));
  });

  it('client: reads own booking by uid and own guest booking by verified email', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'bookings/b-alice')));
    await assertSucceeds(getDoc(doc(alice(), 'bookings/b-alice-guest')));
  });

  it('client: the dashboard queries (by email, by userId) are allowed', async () => {
    await assertSucceeds(getDocs(query(collection(alice(), 'bookings'), where('email', '==', ALICE.email))));
    await assertSucceeds(getDocs(query(collection(alice(), 'bookings'), where('userId', '==', ALICE.uid))));
  });

  it('client: cannot read or query someone else’s bookings', async () => {
    await assertFails(getDoc(doc(alice(), 'bookings/b-bob')));
    await assertFails(getDocs(query(collection(alice(), 'bookings'), where('email', '==', BOB.email))));
    await assertFails(getDocs(query(collection(alice(), 'bookings'), where('userId', '==', BOB.uid))));
    await assertFails(getDocs(collection(alice(), 'bookings')));
  });

  it('unverified email: does not unlock guest bookings under that address', async () => {
    const squatter = signedIn({ uid: 'squatter', email: ALICE.email }, false);
    await assertFails(getDoc(doc(squatter, 'bookings/b-alice-guest')));
    await assertFails(getDocs(query(collection(squatter, 'bookings'), where('email', '==', ALICE.email))));
  });

  it('client: can never write price, payment status or booking status', async () => {
    await assertFails(updateDoc(doc(alice(), 'bookings/b-alice'), { price: 1 }));
    await assertFails(updateDoc(doc(alice(), 'bookings/b-alice'), { paymentStatus: 'paid' }));
    await assertFails(updateDoc(doc(alice(), 'bookings/b-alice'), { status: 'confirmed' }));
  });

  it('client: cannot create or delete bookings directly', async () => {
    await assertFails(
      setDoc(doc(alice(), 'bookings/self-made'), {
        ...BOOKING_FIELDS,
        userId: ALICE.uid,
        email: ALICE.email,
        paymentStatus: 'paid',
        status: 'confirmed',
      }),
    );
    await assertFails(deleteDoc(doc(alice(), 'bookings/b-alice')));
  });

  it('therapist: no direct read (booking docs carry the manage token)', async () => {
    await assertFails(getDoc(doc(therapist(), 'bookings/b-alice')));
    await assertFails(getDocs(query(collection(therapist(), 'bookings'), where('therapistId', '==', 't1'))));
    await assertFails(updateDoc(doc(therapist(), 'bookings/b-alice'), { status: 'confirmed' }));
  });

  it('admin: reads and lists every booking, but still cannot write', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'bookings/b-bob')));
    await assertSucceeds(getDocs(collection(admin(), 'bookings')));
    await assertFails(updateDoc(doc(admin(), 'bookings/b-bob'), { paymentStatus: 'paid' }));
  });

  it('disabled account: loses access to its own bookings', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'bookings/b-disabled'), {
        ...BOOKING_FIELDS,
        userId: DISABLED.uid,
        email: DISABLED.email,
      });
    });
    await assertFails(getDoc(doc(disabled(), 'bookings/b-disabled')));
  });
});

describe('bookings/{id}/audit_logs', () => {
  it('signed out: denied', async () => {
    await assertFails(getDocs(collection(anon(), 'bookings/b-alice/audit_logs')));
  });

  it('client: reads the log of own booking, not of someone else’s', async () => {
    await assertSucceeds(getDocs(collection(alice(), 'bookings/b-alice/audit_logs')));
    await assertFails(getDocs(collection(alice(), 'bookings/b-bob/audit_logs')));
  });

  it('therapist: reads logs of bookings assigned to them only', async () => {
    await assertSucceeds(getDoc(doc(therapist(), 'bookings/b-alice/audit_logs/a1')));
    await assertFails(getDoc(doc(otherTherapist(), 'bookings/b-alice/audit_logs/a1')));
  });

  it('demoted therapist: can no longer read logs of their former bookings', async () => {
    await demoteTherapist();
    await assertFails(getDoc(doc(therapist(), 'bookings/b-alice/audit_logs/a1')));
  });

  it('admin reads; nobody writes', async () => {
    await assertSucceeds(getDocs(collection(admin(), 'bookings/b-bob/audit_logs')));
    await assertFails(setDoc(doc(admin(), 'bookings/b-bob/audit_logs/forged'), { action: 'x' }));
    await assertFails(setDoc(doc(alice(), 'bookings/b-alice/audit_logs/forged'), { action: 'refunded' }));
  });
});

// ---------------------------------------------------------------------------
// payments (receipts are derived from booking + payment, never stored)
// ---------------------------------------------------------------------------

describe('payments', () => {
  it('signed out: denied', async () => {
    await assertFails(getDoc(doc(anon(), 'payments/p-alice')));
  });

  it('client: no direct read, even of their own payment (served via /api)', async () => {
    await assertFails(getDoc(doc(alice(), 'payments/p-alice')));
    await assertFails(getDocs(query(collection(alice(), 'payments'), where('patientEmail', '==', ALICE.email))));
  });

  it('client: cannot forge or mark a payment as captured', async () => {
    await assertFails(setDoc(doc(alice(), 'payments/forged'), { bookingId: 'b-alice', amount: 1, status: 'captured' }));
    await assertFails(updateDoc(doc(alice(), 'payments/p-alice'), { status: 'refunded' }));
  });

  it('therapist: denied', async () => {
    await assertFails(getDoc(doc(therapist(), 'payments/p-alice')));
  });

  it('admin: reads, cannot write', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'payments/p-alice')));
    await assertFails(updateDoc(doc(admin(), 'payments/p-alice'), { amount: 0 }));
  });
});

// ---------------------------------------------------------------------------
// reschedule_requests
// ---------------------------------------------------------------------------

describe('reschedule_requests', () => {
  it('signed out: denied', async () => {
    await assertFails(getDoc(doc(anon(), 'reschedule_requests/r-alice')));
  });

  it('client: reads own request, not someone else’s; cannot create, edit or delete', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'reschedule_requests/r-alice')));
    await assertFails(getDoc(doc(alice(), 'reschedule_requests/r-bob')));
    await assertFails(setDoc(doc(alice(), 'reschedule_requests/new'), { userId: ALICE.uid, status: 'pending' }));
    await assertFails(updateDoc(doc(alice(), 'reschedule_requests/r-alice'), { status: 'approved' }));
    await assertFails(deleteDoc(doc(alice(), 'reschedule_requests/r-alice')));
  });

  it('therapist: reads and updates requests for their own bookings only', async () => {
    await assertSucceeds(getDoc(doc(therapist(), 'reschedule_requests/r-alice')));
    await assertSucceeds(updateDoc(doc(therapist(), 'reschedule_requests/r-alice'), { status: 'approved' }));
    await assertFails(getDoc(doc(therapist(), 'reschedule_requests/r-bob')));
    await assertFails(updateDoc(doc(therapist(), 'reschedule_requests/r-bob'), { status: 'approved' }));
  });

  it('therapist: cannot rewrite who a request belongs to', async () => {
    // Reassigning userId would plant the request in another client's
    // dashboard and data export; reassigning therapistId hands it to a
    // colleague; bookingId points it at a different session.
    await assertFails(updateDoc(doc(therapist(), 'reschedule_requests/r-alice'), { userId: BOB.uid }));
    await assertFails(updateDoc(doc(therapist(), 'reschedule_requests/r-alice'), { therapistId: 't2' }));
    await assertFails(updateDoc(doc(therapist(), 'reschedule_requests/r-alice'), { bookingId: 'b-bob' }));
    await assertFails(deleteDoc(doc(therapist(), 'reschedule_requests/r-alice')));
  });

  it('demoted therapist: loses access even though therapists/{id}.authId still names them', async () => {
    await demoteTherapist();
    await assertFails(getDoc(doc(therapist(), 'reschedule_requests/r-alice')));
    await assertFails(updateDoc(doc(therapist(), 'reschedule_requests/r-alice'), { status: 'approved' }));
  });

  it('admin: full read/update/delete', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'reschedule_requests/r-bob')));
    await assertSucceeds(updateDoc(doc(admin(), 'reschedule_requests/r-bob'), { status: 'declined' }));
    await assertSucceeds(deleteDoc(doc(admin(), 'reschedule_requests/r-bob')));
  });
});

// ---------------------------------------------------------------------------
// Admin-only collections
// ---------------------------------------------------------------------------

describe.each(['contacts/c1', 'therapist_reconnect_requests/x1'])('%s (admin-only)', (path) => {
  const coll = path.split('/')[0];

  it('signed out, client and therapist: no read, no create', async () => {
    await assertFails(getDoc(doc(anon(), path)));
    await assertFails(getDoc(doc(alice(), path)));
    await assertFails(getDoc(doc(therapist(), path)));
    await assertFails(setDoc(doc(anon(), `${coll}/new`), { message: 'spam' }));
    await assertFails(setDoc(doc(alice(), `${coll}/new`), { message: 'spam' }));
  });

  it('admin: reads, updates and deletes, but creation is server-only', async () => {
    await assertSucceeds(getDoc(doc(admin(), path)));
    await assertSucceeds(updateDoc(doc(admin(), path), { status: 'handled' }));
    await assertSucceeds(deleteDoc(doc(admin(), path)));
    await assertFails(setDoc(doc(admin(), `${coll}/new`), { message: 'x' }));
  });
});

// ---------------------------------------------------------------------------
// Server-only collections
// ---------------------------------------------------------------------------

describe('locked_slots (server-only)', () => {
  it('denies every client, admin included', async () => {
    await assertFails(getDoc(doc(anon(), 'locked_slots/s1')));
    await assertFails(getDoc(doc(bob(), 'locked_slots/s1')));
    await assertFails(getDoc(doc(admin(), 'locked_slots/s1')));
    await assertFails(setDoc(doc(alice(), 'locked_slots/s2'), { holderUid: ALICE.uid }));
    await assertFails(deleteDoc(doc(alice(), 'locked_slots/s1')));
  });

  it('the server (rules bypassed) can still write holds', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await assertSucceeds(setDoc(doc(ctx.firestore() as unknown as Firestore, 'locked_slots/s2'), { lockId: 'l2' }));
    });
  });
});

describe('availability_rules', () => {
  it('public read', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'availability_rules/ar1')));
  });

  it('no client writes, therapist and admin included', async () => {
    await assertFails(setDoc(doc(therapist(), 'availability_rules/ar2'), { therapistId: 't1' }));
    await assertFails(updateDoc(doc(admin(), 'availability_rules/ar1'), { day: 2 }));
  });
});

describe('therapistAvailability (+ recurringRules, overrides)', () => {
  const paths = [
    'therapistAvailability/t1',
    'therapistAvailability/t1/recurringRules/rr1',
    'therapistAvailability/t1/overrides/o1',
  ];

  it('signed out: no read', async () => {
    for (const p of paths) await assertFails(getDoc(doc(anon(), p)));
  });

  it('any signed-in user reads', async () => {
    for (const p of paths) await assertSucceeds(getDoc(doc(alice(), p)));
  });

  it('the owning therapist cannot write their schedule directly (goes through /api)', async () => {
    await assertFails(setDoc(doc(therapist(), 'therapistAvailability/t1/recurringRules/rr2'), { day: 2 }));
    await assertFails(updateDoc(doc(therapist(), 'therapistAvailability/t1/overrides/o1'), { closed: false }));
    await assertFails(updateDoc(doc(therapist(), 'therapistAvailability/t1'), { timezone: 'UTC' }));
    await assertFails(setDoc(doc(admin(), 'therapistAvailability/t1/recurringRules/rr3'), { day: 3 }));
  });
});

// ---------------------------------------------------------------------------
// Default deny
// ---------------------------------------------------------------------------

describe('collections without a rule fall through to default deny', () => {
  it('session_notes and other unlisted collections are closed to everyone', async () => {
    await assertFails(getDoc(doc(alice(), 'session_notes/n1')));
    await assertFails(getDoc(doc(therapist(), 'session_notes/n1')));
    await assertFails(getDoc(doc(admin(), 'session_notes/n1')));
    await assertFails(setDoc(doc(alice(), 'reviews/r1'), { rating: 5 }));
    await assertFails(setDoc(doc(alice(), 'outbox_events/e1'), { type: 'x' }));
  });

  it('the server (rules bypassed) can still read them', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await assertSucceeds(getDoc(doc(ctx.firestore() as unknown as Firestore, 'session_notes/n1')));
    });
  });
});
