import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/verifySession';
import { receiptService } from '@/server/services/ReceiptService';
import { renderReceiptPdf, receiptFileName } from '@/server/pdf/renderReceiptPdf';
import { logger } from '../../../_lib/logger';
import { checkRateLimit } from '../../../_lib/rateLimit';

export const dynamic = 'force-dynamic';
/** Node runtime: the generator writes bytes with `Buffer`. */
export const runtime = 'nodejs';

/**
 * The receipt PDF for one booking, for its owner.
 *
 * Authorization is the whole point of this handler's shape. The URL names a
 * booking id, which is exactly the "change the id and get somebody else's
 * receipt" attack, so the id is never trusted: the session is verified, the
 * booking is loaded server-side, and `ReceiptService.getForClient` refuses
 * anything the verified identity does not own. A booking that exists but belongs
 * to another client is indistinguishable in the response from one that does not
 * exist, so the endpoint cannot be used to enumerate bookings either.
 *
 * `?download=1` switches the disposition from inline (view/print in the browser's
 * PDF viewer) to attachment (save to disk). Both serve the same real PDF built
 * from the stored payment and booking records.
 */
export async function GET(req: Request, context: { params: Promise<{ bookingId: string }> }) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rateCheck = checkRateLimit(clientIp, 'receipt_pdf', 30, 60000);
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: 'Too many receipt requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    const session = await verifySession(req);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Please sign in to download this receipt.' },
        { status: 401 }
      );
    }

    const { bookingId } = await context.params;
    const receipt = await receiptService.getForClient(
      { uid: session.uid, email: session.email },
      bookingId
    );

    if (!receipt) {
      // Covers "no such booking", "not yours" and "never paid for" alike.
      return NextResponse.json(
        { success: false, error: 'We could not find a receipt for this session.' },
        { status: 404 }
      );
    }

    const pdf = renderReceiptPdf(receipt);
    const disposition = new URL(req.url).searchParams.get('download') === '1' ? 'attachment' : 'inline';

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.byteLength),
        'Content-Disposition': `${disposition}; filename="${receiptFileName(receipt)}"`,
        // A receipt is personal data: never let a shared cache hold it.
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    logger.error('PAYMENT', 'Failed to render receipt PDF', error);
    return NextResponse.json(
      { success: false, error: 'We could not generate this receipt right now. Please try again.' },
      { status: 500 }
    );
  }
}
