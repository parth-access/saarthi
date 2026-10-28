import { fetchWithAuth } from '@/lib/fetchWithAuth';
import type { TherapistAvailabilityRule, TherapistOverride } from '../types';

/**
 * A therapist's working hours (recurring rules) and closed dates (overrides),
 * read and written through /api/therapist/availability/*.
 *
 * Everything goes through the API, whichever sign-in provider is active: the
 * route checks the owning therapist (or an admin) on every call, and the
 * workspace never has to ship the Firestore SDK. A failed read throws rather
 * than returning an empty schedule, so the editor can say "could not load"
 * instead of showing a therapist no hours at all.
 */
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request did not go through. Please try again.');
  return data as T;
}

const q = encodeURIComponent;

type RulePayload = Omit<TherapistAvailabilityRule, 'id' | 'therapistId'>;
interface OverridePayload {
  date: string;
  type: 'blocked' | 'available';
  reason?: string | null;
}

export type ScheduleChangeRequest = (
  | { action: 'save_rule'; ruleId: string | null; rule: RulePayload }
  | { action: 'delete_rule'; ruleId: string }
  | { action: 'save_override'; overrideId: string | null; override: OverridePayload }
  | { action: 'delete_override'; overrideId: string }
) & { acknowledgeImpact?: boolean };

export interface ScheduleWriteResult {
  applied: boolean;
  /** Plain sentences on what the change does to existing bookings. */
  notes?: string[];
  warnings?: string[];
  summary?: string;
}

export const therapistAvailabilityService = {
  getAvailabilityRules: async (therapistId: string): Promise<TherapistAvailabilityRule[]> =>
    (await call<{ items: TherapistAvailabilityRule[] }>(`/api/therapist/availability/rule?therapistId=${q(therapistId)}`)).items ?? [],

  getOverrides: async (therapistId: string): Promise<TherapistOverride[]> =>
    (await call<{ items: TherapistOverride[] }>(`/api/therapist/availability/override?therapistId=${q(therapistId)}`)).items ?? [],

  /**
   * One change to the signed-in therapist's own schedule. A change that would
   * leave booked sessions outside the new hours (or remove the last working
   * day) comes back `applied: false` with `notes` saying why, and nothing is
   * written; send it again with `acknowledgeImpact: true` to apply it.
   */
  writeSchedule: (change: ScheduleChangeRequest): Promise<ScheduleWriteResult> =>
    call('/api/therapist/schedule', { method: 'POST', body: JSON.stringify(change) }),
};
