/**
 * Firestore write-shape guards.
 *
 * Firestore rejects `FieldValue` sentinels (`serverTimestamp()`, `increment()`,
 * `arrayUnion()`, …) anywhere inside an array — including inside an object that
 * is itself an array element. Production hit exactly that:
 *
 *   FieldValue.serverTimestamp() cannot be used inside an array
 *   (found in field "rescheduleHistory.0.rescheduledAt")
 *
 * Sentinels ARE legal at the top level and inside nested maps, which is why the
 * rest of the codebase (`updatedAt`, `declinedAt`, `timestamp`) is fine. Array
 * elements must carry concrete values instead: a `Date`, a `Timestamp`, an ISO
 * string or epoch millis.
 *
 * This module is deliberately dependency-free (it does NOT import
 * firebase-admin) so it is safe to use from the domain layer and from code that
 * may be bundled for the browser.
 */

/** Internal marker every firebase-admin FieldValue sentinel carries. */
const SENTINEL_CONSTRUCTORS = new Set([
  'FieldValue',
  'ServerTimestampTransform',
  'DeleteTransform',
  'NumericIncrementTransform',
  'ArrayUnionTransform',
  'ArrayRemoveTransform',
]);

/**
 * True when `value` is a Firestore `FieldValue` sentinel rather than a concrete
 * value. Detected structurally so this file needs no firebase-admin import.
 *
 * Three probes, because the two SDKs spell the marker differently and neither
 * spelling is guaranteed to survive bundling: firebase-admin exposes
 * `methodName` (a prototype getter returning e.g. `'FieldValue.serverTimestamp'`),
 * the web SDK uses `_methodName`, and the constructor-name set is the last
 * resort — it is the only one of the three that minification can rename, so it
 * must not be the only check.
 */
export function isFirestoreSentinel(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { methodName?: unknown; _methodName?: unknown; constructor?: { name?: string } };
  if (typeof candidate.methodName === 'string') return true;
  if (typeof candidate._methodName === 'string') return true;
  const ctorName = candidate.constructor?.name;
  return !!ctorName && SENTINEL_CONSTRUCTORS.has(ctorName);
}

/**
 * Normalises a timestamp that is about to be stored *inside an array element*.
 *
 * Concrete values pass through untouched so callers keep control of the clock.
 * A sentinel cannot be stored in an array, so it is replaced with the current
 * instant — the same value the sentinel would have resolved to moments later.
 * The substitution is intentional and lossless enough for history records; it
 * is never applied to top-level fields, where sentinels remain preferred.
 */
export function toArraySafeTimestamp(
  value: unknown,
  fallback: Date = new Date()
): Date | string | number | object {
  if (value === undefined || value === null) return fallback;
  if (isFirestoreSentinel(value)) return fallback;
  return value as Date | string | number | object;
}

/**
 * Walks a would-be Firestore payload and returns the dotted path of the first
 * sentinel found inside an array, or `null` when the payload is safe.
 */
export function findSentinelInsideArray(payload: unknown, path = ''): string | null {
  if (Array.isArray(payload)) {
    for (let i = 0; i < payload.length; i++) {
      const found = findSentinelInArrayElement(payload[i], `${path}.${i}`);
      if (found) return found;
    }
    return null;
  }

  if (payload && typeof payload === 'object' && !isFirestoreSentinel(payload)) {
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      const found = findSentinelInsideArray(value, path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }

  return null;
}

/** Inside an array every nested sentinel is illegal, at any depth. */
function findSentinelInArrayElement(value: unknown, path: string): string | null {
  if (isFirestoreSentinel(value)) return path;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findSentinelInArrayElement(value[i], `${path}.${i}`);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const found = findSentinelInArrayElement(nested, `${path}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Fails fast, with the offending field path, when a payload would be rejected
 * by Firestore for carrying a sentinel inside an array. Called on the write
 * path so the bug surfaces at the seam that produced it instead of as an opaque
 * 500 from the Firestore client.
 */
export function assertNoSentinelsInsideArrays(payload: unknown, context: string): void {
  const offendingPath = findSentinelInsideArray(payload);
  if (offendingPath) {
    throw new Error(
      `${context}: a Firestore FieldValue sentinel cannot be stored inside an array ` +
        `(found at "${offendingPath}"). Use a concrete Date/Timestamp for array elements.`
    );
  }
}

/**
 * Plain objects are walked; class instances (`Timestamp`, `Date`, `DocumentReference`,
 * FieldValue sentinels) are opaque values and must be returned untouched.
 */
function isWalkableObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Removes `undefined` from a would-be Firestore payload, recursively.
 *
 * This app never enables `ignoreUndefinedProperties`, so a single `undefined`
 * anywhere in a document makes the Firestore client reject the whole write —
 * and inside a transaction that aborts every other write with it. That is how an
 * optional field nobody passed (`customNote` on a decline) turned into a 500 on
 * `/api/bookings/cancel-self`.
 *
 * Object keys holding `undefined` are dropped, which matches how the rest of the
 * codebase persists optional fields (see `BookingMapper.toPersistence`). Array
 * elements are replaced with `null` instead of being dropped, so positions and
 * arity survive — silently reindexing an array would corrupt data to save a
 * write. Sentinels, `Timestamp`s and `Date`s pass through as values, and `null`
 * is preserved: it is a legal Firestore value and means something different from
 * absence.
 */
export function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((element) => (element === undefined ? null : pruneUndefined(element))) as unknown as T;
  }

  if (isWalkableObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) continue;
      out[key] = pruneUndefined(nested);
    }
    return out as unknown as T;
  }

  return value;
}
