import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { readAdminClients } from './clientSources';
import { logger } from '../../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Clients, reconstructed from bookings.
 *
 * `?q=` is an email — the one contact field normalized at write time and therefore
 * the only reliable identity. With it, the handler reads every booking for that
 * email and returns them; the browser runs `deriveClientProfile` to build the
 * profile. Without it, only the recent-activity list is read, which the browser
 * collapses into distinct clients. Search by name lives in Bookings, which is the
 * booking-centric source of truth; from a booking, an operator has the email.
 *
 * Read-only. This console never writes a client — there is no client record to
 * write — and every figure it shows is derived, so there is nothing here to
 * misclick. Nothing raw crosses the wire: a Firestore error is logged server-side
 * and the browser gets fixed copy, so an index-creation URL or project id in an
 * error message is never rendered.
 */
export async function GET(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  try {
    const query = new URL(req.url).searchParams.get('q');
    const clients = await readAdminClients(query);
    return NextResponse.json(
      { success: true, ...clients },
      {
        headers: {
          // Scoped to one admin's session, and carries client PII — never cached.
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    // The profile and the scan each catch their own failure, so reaching here means
    // the assembly itself broke. The real error goes to the server log only.
    logger.error('BOOKING', 'Admin clients failed to assemble', error);
    return NextResponse.json(
      { success: false, error: 'We could not load clients right now. Please try again.' },
      { status: 500 }
    );
  }
}
