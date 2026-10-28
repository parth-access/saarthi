import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * A therapist's own schedule changes: who may write, and whose schedule.
 * Validation and booking impact are the shared `runScheduleWrite`, tested
 * through the admin route.
 */
const h = vi.hoisted(() => ({ access: vi.fn(), run: vi.fn(), rate: vi.fn() }));

vi.mock('../_lib/authCheck', () => ({ checkTherapistAccess: h.access }));
vi.mock('../../_lib/rateLimit', () => ({ checkRateLimit: h.rate, getClientIp: () => '1.1.1.1' }));
vi.mock('../../_lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('../../admin/therapists/[therapistId]/schedule/runScheduleWrite', () => ({ runScheduleWrite: h.run }));

import { POST } from './route';

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/therapist/schedule', { method: 'POST', body: JSON.stringify(body) }));

const rule = {
  dayOfWeek: 1,
  isActive: true,
  startTime: '09:00',
  endTime: '17:00',
  slotDuration: 45,
  cooldownGap: 15,
  breaks: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.rate.mockReturnValue({ success: true });
  h.run.mockResolvedValue(NextResponse.json({ success: true, applied: true }));
});

describe('POST /api/therapist/schedule', () => {
  it('answers whatever the access check refused with, and writes nothing', async () => {
    h.access.mockResolvedValue({ authorized: false, errorResponse: NextResponse.json({}, { status: 401 }) });
    expect((await post({ action: 'delete_rule', ruleId: 'r1' })).status).toBe(401);
    expect(h.run).not.toHaveBeenCalled();
  });

  it('refuses an admin: admins change schedules through their own route', async () => {
    h.access.mockResolvedValue({ authorized: true, uid: 'a1', role: 'admin' });
    expect((await post({ action: 'delete_rule', ruleId: 'r1' })).status).toBe(403);
    expect(h.run).not.toHaveBeenCalled();
  });

  it('writes the schedule linked to the session, as the therapist', async () => {
    h.access.mockResolvedValue({ authorized: true, uid: 'u1', role: 'therapist', therapistId: 'th_own' });
    const res = await post({ action: 'save_rule', ruleId: null, rule });
    expect(res.status).toBe(200);
    expect(h.run).toHaveBeenCalledWith(
      'th_own',
      expect.objectContaining({ action: 'save_rule', rule }),
      { uid: 'u1', label: 'Therapist' }
    );
  });

  it('refuses a body that names a therapist, rather than ignoring it', async () => {
    h.access.mockResolvedValue({ authorized: true, uid: 'u1', role: 'therapist', therapistId: 'th_own' });
    const res = await post({ action: 'delete_rule', ruleId: 'r1', therapistId: 'th_other' });
    expect(res.status).toBe(400);
    expect(h.run).not.toHaveBeenCalled();
  });

  it('refuses a session length the practice does not run', async () => {
    h.access.mockResolvedValue({ authorized: true, uid: 'u1', role: 'therapist', therapistId: 'th_own' });
    expect((await post({ action: 'save_rule', ruleId: null, rule: { ...rule, slotDuration: 50 } })).status).toBe(400);
  });

  it('rate-limits a flood', async () => {
    h.access.mockResolvedValue({ authorized: true, uid: 'u1', role: 'therapist', therapistId: 'th_own' });
    h.rate.mockReturnValue({ success: false });
    expect((await post({ action: 'delete_rule', ruleId: 'r1' })).status).toBe(429);
  });
});
