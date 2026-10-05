/**
 * Whether a string is shaped like a Firestore therapist document id.
 *
 * This is a request-validity check, not an existence check — a well-formed id
 * that matches no document is a 404, but a value that could never be a document
 * id (empty, a path segment, an overlong string) is a 400. Kept out of the route
 * so the read route and the schedule write route apply exactly the same rule.
 */
export function isReadableTherapistId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const id = value.trim();
  if (id.length === 0 || id.length > 200) return false;
  // Firestore document ids cannot contain a slash or be a relative-path token.
  if (id.includes('/') || id === '.' || id === '..') return false;
  return true;
}
