import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  access: { authorized: true } as { authorized: boolean; errorResponse?: Response },
  checkTherapistAccess: vi.fn(),
  collectionPath: '',
  docs: [] as Array<{ id: string; data: Record<string, unknown> }>,
}));

vi.mock('./authCheck', () => ({ checkTherapistAccess: h.checkTherapistAccess }));
vi.mock('../../_lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (path: string) => {
      h.collectionPath = path;
      return { get: async () => ({ docs: h.docs.map((d) => ({ id: d.id, data: () => d.data })) }) };
    },
  },
}));

import { GET as getRules } from '../availability/rule/route';
import { GET as getOverrides } from '../availability/override/route';

const req = (path: string) => new Request(`https://www.saarthilife.com${path}`);

beforeEach(() => {
  vi.clearAllMocks();
  h.checkTherapistAccess.mockImplementation(async () => h.access);
  h.access = { authorized: true };
  h.docs = [];
  h.collectionPath = '';
});

describe('GET therapist availability', () => {
  it('lists recurring rules for an authorized therapist', async () => {
    h.docs = [{ id: 'r1', data: { dayOfWeek: 1, startTime: '09:00' } }];
    const res = await getRules(req('/api/therapist/availability/rule?therapistId=t1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ id: 'r1', dayOfWeek: 1, startTime: '09:00' }] });
    expect(h.collectionPath).toBe('therapistAvailability/t1/recurringRules');
    expect(h.checkTherapistAccess).toHaveBeenCalledWith(expect.any(Request), 't1', 'READ_AVAILABILITY_RULES');
  });

  it('lists overrides from their own collection', async () => {
    await getOverrides(req('/api/therapist/availability/override?therapistId=t1'));
    expect(h.collectionPath).toBe('therapistAvailability/t1/overrides');
  });

  it("refuses someone else's schedule with the access check's response", async () => {
    h.access = { authorized: false, errorResponse: new Response('nope', { status: 403 }) };
    const res = await getRules(req('/api/therapist/availability/rule?therapistId=t2'));
    expect(res.status).toBe(403);
    expect(h.collectionPath).toBe('');
  });

  it('needs a therapistId', async () => {
    expect((await getRules(req('/api/therapist/availability/rule'))).status).toBe(400);
  });
});
