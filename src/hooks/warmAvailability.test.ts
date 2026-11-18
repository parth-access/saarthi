// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { warmAvailability } from './useAvailability';

describe('warmAvailability', () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('pings availability once per therapist with an IST date', () => {
    warmAvailability('t-warm-1');
    warmAvailability('t-warm-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toMatch(/^\/api\/availability\?therapistId=t-warm-1&date=\d{4}-\d{2}-\d{2}$/);
  });

  it('does nothing without a therapist', () => {
    warmAvailability('');
    warmAvailability(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows network errors', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    expect(() => warmAvailability('t-warm-2')).not.toThrow();
  });
});
