/**
 * Unifies the session pricing calculations across the application.
 */
export function calculateBookingPrice(sessionMode?: string): number {
  const rawSessionMode = sessionMode?.toLowerCase();
  const normalizedSessionMode = rawSessionMode === 'in_person' ? 'in_person' : 'online';
  return normalizedSessionMode === 'in_person' ? 2000 : 1500;
}
