import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/verifySession';
import { receiptService } from '@/server/services/ReceiptService';
import { logger } from '../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * The signed-in client's own receipts.
 *
 * Takes no parameters at all — deliberately. The set of receipts is a function of
 * the verified session and nothing else, so there is no id, email or filter a
 * caller could tamper with to widen the result. This replaces a browser-side
 * Firestore query on the `payments` collection, which could never match (no
 * document has the `userId` field it filtered on) and put the ownership decision
 * on the client in the first place.
 */
export async function GET(req: Request) {
  try {
    const session = await verifySession(req);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Please sign in to view your receipts.' },
        { status: 401 }
      );
    }

    const receipts = await receiptService.listForClient({
      uid: session.uid,
      email: session.email,
    });

    return NextResponse.json(
      { success: true, receipts },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    logger.error('PAYMENT', 'Failed to list receipts', error);
    return NextResponse.json(
      { success: false, error: 'We could not load your receipts right now. Please try again.' },
      { status: 500 }
    );
  }
}
