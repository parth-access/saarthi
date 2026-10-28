import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ fetchWithAuth: vi.fn() }));
vi.mock('@/lib/fetchWithAuth', () => ({ fetchWithAuth: h.fetchWithAuth }));

import { therapistAvailabilityService } from './therapistAvailabilityService';

const reply = (ok: boolean, body: unknown) => ({ ok, json: async () => body });

beforeEach(() => vi.clearAllMocks());

describe('therapistAvailabilityService', () => {
  it('reads recurring rules and overrides through the API', async () => {
    h.fetchWithAuth.mockResolvedValueOnce(reply(true, { items: [{ id: 'r1' }] }));
    expect(await therapistAvailabilityService.getAvailabilityRules('t 1')).toEqual([{ id: 'r1' }]);
    expect(h.fetchWithAuth).toHaveBeenCalledWith('/api/therapist/availability/rule?therapistId=t%201', undefined);

    h.fetchWithAuth.mockResolvedValueOnce(reply(true, { items: [{ id: 'o1' }] }));
    expect(await therapistAvailabilityService.getOverrides('t1')).toEqual([{ id: 'o1' }]);
  });

  it('throws on a refused read instead of showing an empty schedule', async () => {
    h.fetchWithAuth.mockResolvedValue(reply(false, { error: 'Forbidden' }));
    await expect(therapistAvailabilityService.getAvailabilityRules('t1')).rejects.toThrow('Forbidden');
  });

  it('sends schedule changes to the validated endpoint and passes back an unapplied answer', async () => {
    h.fetchWithAuth.mockResolvedValue(reply(true, { applied: false, notes: ['1 booked session falls outside'] }));
    const result = await therapistAvailabilityService.writeSchedule({ action: 'delete_rule', ruleId: 'r1' });
    expect(h.fetchWithAuth).toHaveBeenCalledWith('/api/therapist/schedule', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete_rule', ruleId: 'r1' }),
    });
    expect(result).toEqual({ applied: false, notes: ['1 booked session falls outside'] });
  });

  it('surfaces the server’s reason when a change is refused', async () => {
    h.fetchWithAuth.mockResolvedValue(reply(false, { error: 'This overlaps an active rule already on this day.' }));
    await expect(
      therapistAvailabilityService.writeSchedule({ action: 'delete_override', overrideId: 'o1' })
    ).rejects.toThrow('This overlaps');
  });
});
