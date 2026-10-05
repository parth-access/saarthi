import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET as listReceipts } from './route';
import { GET as receiptPdf } from './[bookingId]/pdf/route';
import { verifySession } from '@/lib/auth/verifySession';
import { receiptService } from '@/server/services/ReceiptService';
import type { Receipt } from '@/domains/payment/Receipt';

/**
 * The HTTP edge of the receipt feature.
 *
 * `ReceiptService.test.ts` proves the ownership rule; these prove the routes
 * actually apply it and that nothing leaks through the response itself. The two
 * that matter most: an unauthenticated caller never reaches the service at all,
 * and a booking id belonging to somebody else answers 404 with no bytes — the
 * literal "change the ID in the URL" attack from the brief.
 *
 * The rate limiter and the PDF renderer are deliberately NOT mocked. The limiter is
 * a pure in-memory window, and mocking the renderer would leave "does this endpoint
 * actually return a PDF" untested, which is the one thing a user would notice.
 */

vi.mock('@/lib/auth/verifySession', () => ({ verifySession: vi.fn() }));

vi.mock('@/server/services/ReceiptService', () => ({
  receiptService: { listForClient: vi.fn(), getForClient: vi.fn() },
}));

const SESSION = { uid: 'uid_ananya', email: 'ananya@example.com' };

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    receiptNumber: 'SAAR-2026-K7X2M9QD',
    bookingId: 'bk_20260902_ABCD1234',
    paidAtIso: '2026-09-01T10:15:00.000Z',
    clientName: 'Ananya Sharma',
    clientEmail: 'ananya@example.com',
    therapistName: 'Dr Priya Menon',
    sessionType: 'Individual therapy',
    sessionMode: 'online',
    sessionDate: '2026-09-10',
    sessionTime: '09:00',
    amount: 1500,
    currency: 'INR',
    status: 'paid',
    razorpayPaymentId: 'pay_XYZ789',
    razorpayOrderId: 'order_ABC123',
    refundedAmount: null,
    refundedAtIso: null,
    refundReference: null,
    ...overrides,
  };
}

/** A fresh IP per test: the rate-limit store is module-level and shared. */
let ipCounter = 0;
function pdfRequest(bookingId: string, query = '') {
  ipCounter += 1;
  return [
    new Request(`http://localhost/api/receipts/${bookingId}/pdf${query}`, {
      headers: { 'x-forwarded-for': `10.0.0.${ipCounter}` },
    }),
    { params: Promise.resolve({ bookingId }) },
  ] as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifySession).mockResolvedValue(SESSION as never);
});

describe('GET /api/receipts', () => {
  it('returns the signed-in client’s receipts', async () => {
    vi.mocked(receiptService.listForClient).mockResolvedValue([receipt()]);
    const res = await listReceipts(new Request('http://localhost/api/receipts'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.receipts).toHaveLength(1);
    expect(body.receipts[0].receiptNumber).toBe('SAAR-2026-K7X2M9QD');
  });

  it('asks the service only for the verified identity', async () => {
    // The route accepts no parameters, so there is nothing a caller can send to
    // widen the result set.
    vi.mocked(receiptService.listForClient).mockResolvedValue([]);
    await listReceipts(new Request('http://localhost/api/receipts?uid=uid_rahul&email=rahul@x.com'));
    expect(receiptService.listForClient).toHaveBeenCalledWith({
      uid: 'uid_ananya',
      email: 'ananya@example.com',
    });
  });

  it('rejects an unauthenticated caller without touching the service', async () => {
    vi.mocked(verifySession).mockResolvedValue(null as never);
    const res = await listReceipts(new Request('http://localhost/api/receipts'));
    expect(res.status).toBe(401);
    expect((await res.json()).success).toBe(false);
    expect(receiptService.listForClient).not.toHaveBeenCalled();
  });

  it('never lets a shared cache hold a receipt list', async () => {
    vi.mocked(receiptService.listForClient).mockResolvedValue([receipt()]);
    const res = await listReceipts(new Request('http://localhost/api/receipts'));
    expect(res.headers.get('Cache-Control')).toContain('private');
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('answers 500 without leaking the underlying error', async () => {
    vi.mocked(receiptService.listForClient).mockRejectedValue(
      new Error('FIRESTORE_INDEX_MISSING projects/saarthi/indexes/bookings')
    );
    const res = await listReceipts(new Request('http://localhost/api/receipts'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(JSON.stringify(body)).not.toContain('FIRESTORE_INDEX_MISSING');
    expect(JSON.stringify(body)).not.toContain('projects/saarthi');
  });

  it('returns an empty list, not an error, for a client with no receipts', async () => {
    vi.mocked(receiptService.listForClient).mockResolvedValue([]);
    const res = await listReceipts(new Request('http://localhost/api/receipts'));
    expect(res.status).toBe(200);
    expect((await res.json()).receipts).toEqual([]);
  });
});

describe('GET /api/receipts/[bookingId]/pdf', () => {
  it('serves a real PDF inline for the owner', async () => {
    vi.mocked(receiptService.getForClient).mockResolvedValue(receipt());
    const res = await receiptPdf(...pdfRequest('bk_20260902_ABCD1234'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');

    const bytes = Buffer.from(await res.arrayBuffer());
    // Not an HTML page named .pdf: the real header and trailer are present.
    expect(bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.7');
    expect(bytes.subarray(-6).toString('latin1')).toBe('%%EOF\n');
    expect(bytes.toString('latin1')).toContain('(SAAR-2026-K7X2M9QD) Tj');
    expect(res.headers.get('Content-Length')).toBe(String(bytes.byteLength));
  });

  it('passes the URL id to the service alongside the verified identity', async () => {
    vi.mocked(receiptService.getForClient).mockResolvedValue(receipt());
    await receiptPdf(...pdfRequest('bk_20260902_ABCD1234'));
    expect(receiptService.getForClient).toHaveBeenCalledWith(
      { uid: 'uid_ananya', email: 'ananya@example.com' },
      'bk_20260902_ABCD1234'
    );
  });

  it('shows inline by default and attaches with ?download=1', async () => {
    vi.mocked(receiptService.getForClient).mockResolvedValue(receipt());
    const view = await receiptPdf(...pdfRequest('bk_1'));
    expect(view.headers.get('Content-Disposition')).toBe(
      'inline; filename="Saarthi-receipt-SAAR-2026-K7X2M9QD.pdf"'
    );

    const save = await receiptPdf(...pdfRequest('bk_1', '?download=1'));
    expect(save.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Saarthi-receipt-SAAR-2026-K7X2M9QD.pdf"'
    );
  });

  it('treats any other download value as a view', async () => {
    vi.mocked(receiptService.getForClient).mockResolvedValue(receipt());
    for (const q of ['?download=0', '?download=true', '?download=', '?d=1']) {
      const res = await receiptPdf(...pdfRequest('bk_1', q));
      expect(res.headers.get('Content-Disposition')).toContain('inline');
    }
  });

  it('takes the first download value when the parameter is repeated', async () => {
    // `searchParams.get` returns the first occurrence, so `?download=1&download=0`
    // attaches. Recorded rather than "fixed": which of the two a caller meant is
    // unknowable, and the disposition carries no authority — the same owner-checked
    // bytes are served either way.
    vi.mocked(receiptService.getForClient).mockResolvedValue(receipt());
    const res = await receiptPdf(...pdfRequest('bk_1', '?download=1&download=0'));
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
  });

  it('cannot be made to emit a header-splitting filename', async () => {
    // The receipt number reaches a response header, so a hostile value must not be
    // able to inject one. `receiptFileName` keeps only [A-Za-z0-9-], so the CR, LF,
    // quote, colon and space are all gone and the hyphen — harmless — survives.
    vi.mocked(receiptService.getForClient).mockResolvedValue(
      receipt({ receiptNumber: 'SAAR"\r\nX-Injected: yes\r\n' })
    );
    const res = await receiptPdf(...pdfRequest('bk_1'));
    expect(res.headers.get('X-Injected')).toBeNull();
    expect(res.headers.get('Content-Disposition')).toBe(
      'inline; filename="Saarthi-receipt-SAARX-Injectedyes.pdf"'
    );
  });

  it('answers 404 for a booking the caller does not own, with no bytes', async () => {
    // The attack from the brief: a real, paid booking id that belongs to someone
    // else. `getForClient` returns null and the route says "not found".
    vi.mocked(receiptService.getForClient).mockResolvedValue(null);
    const res = await receiptPdf(...pdfRequest('bk_someone_elses'));
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).not.toBe('application/pdf');
    const body = await res.json();
    expect(body.success).toBe(false);
    // The message is identical for not-found, not-yours and not-paid, so the
    // response cannot be used to tell which booking ids exist.
    expect(body.error).toBe('We could not find a receipt for this session.');
  });

  it('rejects an unauthenticated caller without loading the booking', async () => {
    vi.mocked(verifySession).mockResolvedValue(null as never);
    const res = await receiptPdf(...pdfRequest('bk_20260902_ABCD1234'));
    expect(res.status).toBe(401);
    expect(receiptService.getForClient).not.toHaveBeenCalled();
  });

  it('never lets a shared cache hold a receipt PDF', async () => {
    vi.mocked(receiptService.getForClient).mockResolvedValue(receipt());
    const res = await receiptPdf(...pdfRequest('bk_1'));
    expect(res.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
  });

  it('answers 500 without leaking the underlying error', async () => {
    vi.mocked(receiptService.getForClient).mockRejectedValue(
      new Error('Firestore backend unavailable for project saarthi-prod')
    );
    const res = await receiptPdf(...pdfRequest('bk_1'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('saarthi-prod');
  });

  it('rate-limits one caller at 30 requests a minute', async () => {
    // A receipt PDF is generated per request, so an unthrottled endpoint is a cheap
    // way to burn server CPU. The limiter is the real one, keyed per IP.
    vi.mocked(receiptService.getForClient).mockResolvedValue(receipt());
    const ip = '203.0.113.77';
    const fire = () =>
      receiptPdf(
        new Request('http://localhost/api/receipts/bk_1/pdf', {
          headers: { 'x-forwarded-for': ip },
        }),
        { params: Promise.resolve({ bookingId: 'bk_1' }) }
      );

    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1) statuses.push((await fire()).status);

    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);

    // A different caller is unaffected by that burst.
    const other = await receiptPdf(...pdfRequest('bk_1'));
    expect(other.status).toBe(200);
  });

  it('checks the rate limit before authenticating', async () => {
    // Order matters: an unauthenticated flood must be cut off by the limiter rather
    // than reaching session verification 10,000 times.
    vi.mocked(verifySession).mockResolvedValue(null as never);
    const ip = '203.0.113.99';
    const fire = () =>
      receiptPdf(
        new Request('http://localhost/api/receipts/bk_1/pdf', {
          headers: { 'x-forwarded-for': ip },
        }),
        { params: Promise.resolve({ bookingId: 'bk_1' }) }
      );

    for (let i = 0; i < 30; i += 1) expect((await fire()).status).toBe(401);
    expect((await fire()).status).toBe(429);
  });
});
