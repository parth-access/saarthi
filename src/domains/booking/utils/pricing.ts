/**
 * Unifies the session pricing calculations across the application.
 *
 * A therapist may carry their own prices (`sessionPrice` for online,
 * `inPersonPrice` for in-person), set from the admin console. When a price is
 * missing or invalid the platform default applies.
 */
export const DEFAULT_ONLINE_PRICE = 1500;
export const DEFAULT_IN_PERSON_PRICE = 2000;

export interface TherapistPricing {
  sessionPrice?: unknown;
  inPersonPrice?: unknown;
}

function validPrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 100000 ? value : null;
}

export function calculateBookingPrice(sessionMode?: string, therapist?: TherapistPricing | null): number {
  const rawSessionMode = sessionMode?.toLowerCase();
  const isInPerson = rawSessionMode === 'in_person';
  if (isInPerson) return validPrice(therapist?.inPersonPrice) ?? DEFAULT_IN_PERSON_PRICE;
  return validPrice(therapist?.sessionPrice) ?? DEFAULT_ONLINE_PRICE;
}
