/**
 * A Firestore document id, and nothing that could be read as a path.
 *
 * `collection('bookings').doc(value)` treats `/` as a path separator, so an
 * id of `a/b/c` would address `bookings/a/b/c` — a document in a subcollection of
 * a different booking. The caller is already an authenticated admin, so this is
 * not a privilege boundary; it stops a projection built for booking documents
 * being handed an arbitrary one, and it turns a malformed id into a 400 instead
 * of a confusing 404 or a Firestore throw.
 *
 * Deliberately not `bk_*`: ids come from `IdGenerator.booking()` today, and older
 * bookings carry other shapes. This constrains the character set, not the format.
 */
const BOOKING_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Firestore reserves ids of the form `__…__` and throws on them rather than
 * returning an empty document, which would surface as a generic 500 instead of
 * the 400 this actually is.
 */
const RESERVED_ID = /^__.*__$/;

/**
 * Shared by the booking detail read and the booking action write so the two
 * cannot drift: an id the console will render must be an id the console will act
 * on, and vice versa.
 */
export function isReadableBookingId(value: string): boolean {
  return BOOKING_ID.test(value) && !RESERVED_ID.test(value);
}
