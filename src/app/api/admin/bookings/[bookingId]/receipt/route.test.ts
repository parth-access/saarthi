import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/server/services/ReceiptService', () => ({ receiptService: { getForAdmin: vi.fn() } }));
vi.mock('@/server/pdf/renderReceiptPdf', () => ({
  renderReceiptPdf: vi.fn(() => new Uint8Array([37, 80, 68, 70])),
  receiptFileName: vi.fn(() => 'saarthi-receipt.pdf'),
}));

import { GET } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { receiptService } from '@/server/services/ReceiptService';

function get(id = 'bk_1', query = '') {
  return GET(new Request(`http://localhost/api/admin/bookings/${id}/receipt${query}`), {
    params: Promise.resolve({ bookingId: id }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/admin/bookings/[bookingId]/receipt', () => {
  it('refuses non-admins without reading the booking', async () => {
    for (const status of [401, 403]) {
      vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'denied' }, { status }));
      expect((await get()).status).toBe(status);
    }
    expect(receiptService.getForAdmin).not.toHaveBeenCalled();
  });

  it('answers 404 for a booking with no receipt', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(receiptService.getForAdmin).mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });

  it('serves the PDF, inline or as a download, never cached', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(receiptService.getForAdmin).mockResolvedValue({ bookingId: 'bk_1' } as never);
    const inline = await get();
    expect(inline.status).toBe(200);
    expect(inline.headers.get('Content-Type')).toBe('application/pdf');
    expect(inline.headers.get('Content-Disposition')).toMatch(/^inline/);
    expect(inline.headers.get('Cache-Control')).toContain('no-store');
    const download = await get('bk_1', '?download=1');
    expect(download.headers.get('Content-Disposition')).toMatch(/^attachment/);
  });
});
