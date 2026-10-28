import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { receiptService } from '@/server/services/ReceiptService';
import { renderReceiptPdf, receiptFileName } from '@/server/pdf/renderReceiptPdf';
import { logger } from '../../../../_lib/logger';

export const dynamic = 'force-dynamic';
/** Node runtime: the generator writes bytes with `Buffer`. */
export const runtime = 'nodejs';

/**
 * Any paid booking's receipt PDF, for an admin — so an operator can send a
 * client the receipt they lost without asking them to sign in.
 *
 * The client route (`/api/receipts/[bookingId]/pdf`) refuses anyone but the
 * booking's owner; this one requires the live admin role instead, re-checked
 * on every request. It is the same PDF, built from the same records.
 */
export async function GET(req: Request, context: { params: Promise<{ bookingId: string }> }) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  const { bookingId } = await context.params;
  try {
    const receipt = await receiptService.getForAdmin(bookingId);
    if (!receipt) {
      return NextResponse.json(
        { success: false, error: 'This booking has no receipt: no payment was captured for it.' },
        { status: 404 }
      );
    }

    const pdf = renderReceiptPdf(receipt);
    const disposition = new URL(req.url).searchParams.get('download') === '1' ? 'attachment' : 'inline';
    logger.info('PAYMENT', 'Admin opened a receipt', { bookingId, adminUid: authorized.uid });

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.byteLength),
        'Content-Disposition': `${disposition}; filename="${receiptFileName(receipt)}"`,
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    logger.error('PAYMENT', 'Admin receipt PDF failed', error, { bookingId });
    return NextResponse.json(
      { success: false, error: 'The receipt could not be generated right now. Try again.' },
      { status: 500 }
    );
  }
}
