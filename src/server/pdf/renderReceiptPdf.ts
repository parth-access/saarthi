import { PdfPage, buildPdf, hexColor, PAGE_WIDTH, PAGE_HEIGHT, sanitizeForPdf } from './pdfDocument';
import { SESSION_DURATION_MINUTES } from '@/shared/constants';
import { formatSessionTimeRange } from '@/lib/sessionDisplay';
import type { Receipt } from '@/domains/payment/Receipt';

/**
 * Renders a Saarthi payment receipt as a real PDF.
 *
 * Every value drawn comes from the `Receipt` built off the booking and payment
 * records — nothing is hardcoded to a user, and a value the records do not hold
 * is printed as an em dash rather than guessed at.
 *
 * On tax: the receipt shows the amount captured and nothing else. There is no
 * tax registration, tax rate, tax component or fee anywhere in the payment
 * schema or the pricing rule (`calculateBookingPrice` returns a flat 1500/2000
 * rupees), so a tax line would be invented. The page this replaced printed
 * "Amounts are inclusive of applicable taxes unless stated otherwise", which
 * asserted a tax treatment the business has never recorded.
 */

const PRIMARY = hexColor('#1F5E3B');
const ACCENT = hexColor('#E6A520');
const INK = hexColor('#1A1A1A');
const MUTED = hexColor('#4B5563');
const HAIRLINE = hexColor('#D8DEDA');
const CREAM = hexColor('#FFFBE7');

const MARGIN = 56;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN;
const LABEL_X = MARGIN;
const VALUE_X = MARGIN + 150;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * Formats an instant as an IST wall-clock string.
 *
 * Written out rather than delegated to `Intl` on purpose: this runs on a server
 * whose local zone is UTC, and `en-GB` short month names changed between ICU
 * versions ("Sep" -> "Sept"), which would make the same receipt render
 * differently on different deploys. IST is a fixed +05:30 with no DST, so the
 * arithmetic is exact.
 */
function formatIstDateTime(iso: string | null, withTime: boolean): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  const ist = new Date(parsed.getTime() + IST_OFFSET_MS);
  const day = ist.getUTCDate();
  const stamp = `${day} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
  if (!withTime) return stamp;
  const hours24 = ist.getUTCHours();
  const period = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${stamp}, ${hours12}:${String(ist.getUTCMinutes()).padStart(2, '0')} ${period} IST`;
}

/** Formats the stored `YYYY-MM-DD` session date as a calendar date, no TZ shift. */
function formatSessionDay(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return date || '—';
  const utc = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(utc.getTime())) return date;
  return `${WEEKDAYS[utc.getUTCDay()]}, ${utc.getUTCDate()} ${MONTHS[utc.getUTCMonth()]} ${utc.getUTCFullYear()}`;
}

/**
 * Indian digit grouping with two decimals: 1500 -> "1,500.00",
 * 150000 -> "1,50,000.00". Hand-rolled for the same ICU-stability reason as the
 * dates above.
 */
export function formatAmount(amount: number, currency: string): string {
  const safe = Number.isFinite(amount) ? Math.abs(amount) : 0;
  const [whole, fraction] = safe.toFixed(2).split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${currency || 'INR'} ${grouped}.${fraction}`;
}

const STATUS_LABEL: Record<Receipt['status'], string> = {
  paid: 'Paid',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
};

const MODE_LABEL: Record<Receipt['sessionMode'], string> = {
  online: 'Online (Google Meet)',
  in_person: 'In person',
};

/** Draws a small-caps section heading and returns the y for the first row under it. */
function sectionHeading(page: PdfPage, label: string, y: number): number {
  page.text(label.toUpperCase(), LABEL_X, y, {
    font: 'bold',
    size: 7.5,
    color: ACCENT,
    charSpacing: 1.1,
  });
  page.line(LABEL_X, y - 7, CONTENT_RIGHT, HAIRLINE, 0.5);
  return y - 22;
}

/** Draws one `label ..... value` row and returns the next row's y. */
function row(page: PdfPage, label: string, value: string, y: number): number {
  page.text(label, LABEL_X, y, { size: 9, color: MUTED });
  page.text(value || '—', VALUE_X, y, { size: 9.5, color: INK });
  return y - 17;
}

export interface ReceiptPdfOptions {
  /** Fixed by the caller so a re-download of the same receipt is byte-identical. */
  generatedAt?: Date;
}

export function renderReceiptPdf(receipt: Receipt, options: ReceiptPdfOptions = {}): Uint8Array {
  const page = new PdfPage();
  const generatedAt = options.generatedAt ?? new Date();

  // Gold rule across the head of the page, then the cream brand band.
  page.rect(0, PAGE_HEIGHT - 6, PAGE_WIDTH, 6, ACCENT);
  page.rect(0, PAGE_HEIGHT - 132, PAGE_WIDTH, 126, CREAM);

  page.text('Saarthi', MARGIN, PAGE_HEIGHT - 58, { font: 'serif', size: 26, color: PRIMARY });
  page.text('Therapy and counselling', MARGIN, PAGE_HEIGHT - 76, { size: 8.5, color: MUTED });
  page.text('saarthilife.com  ·  support@saarthilife.com', MARGIN, PAGE_HEIGHT - 92, {
    size: 8.5,
    color: MUTED,
  });

  page.text('PAYMENT RECEIPT', CONTENT_RIGHT, PAGE_HEIGHT - 54, {
    font: 'bold',
    size: 10,
    color: PRIMARY,
    align: 'right',
    charSpacing: 1.4,
  });
  page.text(receipt.receiptNumber, CONTENT_RIGHT, PAGE_HEIGHT - 72, {
    font: 'bold',
    size: 11,
    color: INK,
    align: 'right',
  });
  page.text(`Issued ${formatIstDateTime(receipt.paidAtIso, false)}`, CONTENT_RIGHT, PAGE_HEIGHT - 88, {
    size: 8.5,
    color: MUTED,
    align: 'right',
  });
  page.text(STATUS_LABEL[receipt.status], CONTENT_RIGHT, PAGE_HEIGHT - 104, {
    font: 'bold',
    size: 9,
    color: receipt.status === 'paid' ? PRIMARY : ACCENT,
    align: 'right',
  });

  let y = PAGE_HEIGHT - 170;

  y = sectionHeading(page, 'Billed to', y);
  // A name that cannot be represented in the base-14 fonts (e.g. Devanagari) is
  // dropped by `sanitizeForPdf` rather than printed as question marks, so the
  // email — always ASCII — carries the identity in that case.
  const displayName = sanitizeForPdf(receipt.clientName) || receipt.clientEmail;
  page.text(displayName || '—', LABEL_X, y, { font: 'bold', size: 11, color: INK });
  y -= 15;
  page.text(receipt.clientEmail || '—', LABEL_X, y, { size: 9, color: MUTED });
  y -= 30;

  y = sectionHeading(page, 'Session', y);
  y = row(page, 'Therapist', receipt.therapistName, y);
  y = row(page, 'Session type', receipt.sessionType, y);
  y = row(page, 'Mode', MODE_LABEL[receipt.sessionMode], y);
  y = row(page, 'Date', formatSessionDay(receipt.sessionDate), y);
  y = row(page, 'Time', `${formatSessionTimeRange(receipt.sessionTime)} IST`, y);
  y = row(page, 'Duration', `${SESSION_DURATION_MINUTES} minutes`, y);
  y -= 13;

  y = sectionHeading(page, 'Payment', y);
  y = row(page, 'Payment status', STATUS_LABEL[receipt.status], y);
  y = row(page, 'Payment date', formatIstDateTime(receipt.paidAtIso, true), y);
  y = row(page, 'Payment reference', receipt.razorpayPaymentId ?? '—', y);
  y = row(page, 'Order reference', receipt.razorpayOrderId ?? '—', y);
  y = row(page, 'Booking reference', receipt.bookingId, y);
  y -= 13;

  // Amount block.
  page.line(LABEL_X, y + 6, CONTENT_RIGHT, HAIRLINE, 0.5);
  y -= 12;
  page.text(`Therapy session (${SESSION_DURATION_MINUTES} minutes)`, LABEL_X, y, { size: 9.5, color: INK });
  page.text(formatAmount(receipt.amount, receipt.currency), CONTENT_RIGHT, y, {
    size: 9.5,
    color: INK,
    align: 'right',
  });
  y -= 26;

  page.rect(LABEL_X - 10, y - 8, CONTENT_RIGHT - LABEL_X + 20, 30, CREAM);
  page.text('Total paid', LABEL_X, y, { font: 'bold', size: 11, color: PRIMARY });
  page.text(formatAmount(receipt.amount, receipt.currency), CONTENT_RIGHT, y, {
    font: 'bold',
    size: 13,
    color: PRIMARY,
    align: 'right',
  });
  y -= 44;

  if (receipt.refundedAmount !== null || receipt.status !== 'paid') {
    y = sectionHeading(page, 'Refund', y);
    y = row(
      page,
      'Refunded amount',
      receipt.refundedAmount !== null ? formatAmount(receipt.refundedAmount, receipt.currency) : '—',
      y
    );
    y = row(page, 'Refunded on', formatIstDateTime(receipt.refundedAtIso, true), y);
    y = row(page, 'Refund reference', receipt.refundReference ?? '—', y);
    y -= 13;
  }

  // Footer, pinned to the page rather than the flow above it.
  const footerY = 96;
  page.line(MARGIN, footerY + 30, CONTENT_RIGHT, HAIRLINE, 0.5);
  page.text(
    'This receipt confirms a payment received by Saarthi through Razorpay.',
    MARGIN,
    footerY + 14,
    { size: 8.5, color: MUTED }
  );
  page.text(
    'Refunds, where the cancellation policy allows one, are returned to the original payment method.',
    MARGIN,
    footerY,
    { size: 8.5, color: MUTED }
  );
  page.text('Questions? support@saarthilife.com', MARGIN, footerY - 14, { size: 8.5, color: MUTED });
  page.text(
    `Generated ${formatIstDateTime(generatedAt.toISOString(), true)}`,
    CONTENT_RIGHT,
    footerY - 14,
    { size: 8, color: MUTED, align: 'right' }
  );
  page.rect(0, 0, PAGE_WIDTH, 4, PRIMARY);

  return buildPdf([page], {
    title: `Saarthi payment receipt ${receipt.receiptNumber}`,
    author: 'Saarthi',
    subject: `Therapy session on ${receipt.sessionDate}`,
    createdAt: generatedAt,
  });
}

/** Filename offered to the browser; safe on every filesystem. */
export function receiptFileName(receipt: Receipt): string {
  return `Saarthi-receipt-${receipt.receiptNumber.replace(/[^A-Za-z0-9-]/g, '')}.pdf`;
}
