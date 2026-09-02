/**
 * An in-memory Firestore stand-in for tests, faithful to the specific rules the
 * real client enforces — each of which has already caused a production 500 here:
 *
 *   1. "Firestore transactions require all reads to be executed before all
 *      writes." (`Transaction.get` reached from
 *      `SlotReservationService.releasePinInTransaction`, on
 *      `/api/bookings/cancel-self` and the admin status route.)
 *   2. `FieldValue.serverTimestamp() cannot be used inside of an array (found in
 *      field "rescheduleHistory.`0`.rescheduledAt")` — on
 *      `/api/bookings/reschedule-self`.
 *   3. `Cannot use "undefined" as a Firestore value` — this project never enables
 *      `ignoreUndefinedProperties`, so one optional field left undefined aborts
 *      the entire write.
 *
 * `runPlannedTransaction` makes (1) unrepresentable at compile time and
 * `assertNoSentinelsInsideArrays` catches (2) on the booking write path. This fake
 * is the runtime half of that guarantee. An ordinary
 * `{ get: vi.fn(), set: vi.fn() }` mock happily accepts all three payloads above,
 * so a command can be reordered, or grow an undefined field, and its tests stay
 * green; here the test fails with the message production would have returned.
 *
 * The rules are re-implemented rather than delegated to the production guards, so
 * that a hole in a guard is still visible through this fake. Every message below
 * was copied from firebase-admin 13's own serializer output.
 *
 * Not a Firestore emulator: queries, indexes, listeners and contention retries
 * are out of scope. It models document reads/writes inside a transaction, which
 * is where this codebase's failures have actually lived.
 */
import { Timestamp } from 'firebase-admin/firestore';
import type { TxReader, TxWriter } from '../transactionPhases';

export interface FakeDocumentReference {
  readonly id: string;
  readonly path: string;
  readonly collectionId: string;
}

export interface FakeDocumentSnapshot {
  readonly id: string;
  readonly ref: FakeDocumentReference;
  readonly exists: boolean;
  data(): Record<string, unknown> | undefined;
  get(field: string): unknown;
}

export type FakeWriteOp = 'create' | 'set' | 'update' | 'delete';

export interface FakeWrite {
  readonly op: FakeWriteOp;
  readonly path: string;
  readonly collectionId: string;
  /** The payload as handed to the transaction, sentinels unresolved. */
  readonly data: Record<string, unknown>;
  readonly merge: boolean;
}

/** Shape of a firebase-admin FieldValue sentinel, as far as this fake needs it. */
interface SentinelLike {
  methodName: string;
  elements?: unknown[];
  operand?: number;
}

function asSentinel(value: unknown): SentinelLike | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { methodName?: unknown; _methodName?: unknown };
  const methodName = candidate.methodName ?? candidate._methodName;
  return typeof methodName === 'string' ? ({ ...value, methodName } as SentinelLike) : null;
}

/** Plain objects are walked; class instances (Timestamp, Date, …) are values. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Firestore quotes array indexes in field paths: `rescheduleHistory.`0`.at`. */
function joinPath(prefix: string, key: string | number): string {
  const segment = typeof key === 'number' ? `\`${key}\`` : key;
  return prefix ? `${prefix}.${segment}` : segment;
}

/**
 * The serializer's document validation, reduced to the two rejections that matter
 * here. Runs when the write is staged, exactly as the real client does — the
 * throw happens at the `set`/`create`/`update` call, not at commit.
 */
function validatePayload(payload: Record<string, unknown>): void {
  walk(payload, '', false);

  function walk(value: unknown, path: string, insideArray: boolean): void {
    if (value === undefined) {
      throw new Error(
        `Value for argument "data" is not a valid Firestore document. ` +
          `Cannot use "undefined" as a Firestore value (found in field "${path}"). ` +
          'If you want to ignore undefined values, enable `ignoreUndefinedProperties`.'
      );
    }

    const sentinel = asSentinel(value);
    if (sentinel) {
      if (insideArray) {
        throw new Error(
          `Value for argument "data" is not a valid Firestore document. ` +
            `${sentinel.methodName}() cannot be used inside of an array (found in field "${path}").`
        );
      }
      // arrayUnion/arrayRemove elements land in an array, so they carry the ban.
      (sentinel.elements ?? []).forEach((el, i) => walk(el, joinPath(path, i), true));
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((el, i) => walk(el, joinPath(path, i), true));
      return;
    }

    if (isPlainObject(value)) {
      for (const [key, nested] of Object.entries(value)) walk(nested, joinPath(path, key), insideArray);
    }
  }
}

/** Marker for a field a `FieldValue.delete()` sentinel removed. */
const DELETED = Symbol('deleted');

/** Resolves one sentinel against the value already stored in that field. */
function resolveSentinel(sentinel: SentinelLike, existing: unknown, commitTime: Timestamp): unknown {
  switch (sentinel.methodName) {
    case 'FieldValue.serverTimestamp':
      return commitTime;
    case 'FieldValue.delete':
      return DELETED;
    case 'FieldValue.increment':
      return (typeof existing === 'number' ? existing : 0) + (sentinel.operand ?? 0);
    case 'FieldValue.arrayUnion': {
      const current = Array.isArray(existing) ? [...existing] : [];
      for (const el of sentinel.elements ?? []) {
        if (!current.some((c) => JSON.stringify(c) === JSON.stringify(el))) current.push(el);
      }
      return current;
    }
    case 'FieldValue.arrayRemove': {
      const current = Array.isArray(existing) ? existing : [];
      const removals = (sentinel.elements ?? []).map((el) => JSON.stringify(el));
      return current.filter((c) => !removals.includes(JSON.stringify(c)));
    }
    default:
      return commitTime;
  }
}

/** Writes `value` at a possibly dotted `path`, mutating `target`. */
function assignPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  const leaf = segments.pop() as string;
  let cursor = target;
  for (const segment of segments) {
    if (!isPlainObject(cursor[segment])) cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  if (value === DELETED) delete cursor[leaf];
  else cursor[leaf] = value;
}

/** Deep-resolves a staged payload into concrete values, against `existing`. */
function materialize(
  payload: Record<string, unknown>,
  existing: Record<string, unknown>,
  commitTime: Timestamp
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = resolveValue(value, existing[key]);
  }
  return out;

  function resolveValue(value: unknown, existingValue: unknown): unknown {
    const sentinel = asSentinel(value);
    if (sentinel) return resolveSentinel(sentinel, existingValue, commitTime);
    if (Array.isArray(value)) return value.map((el) => resolveValue(el, undefined));
    if (isPlainObject(value)) {
      const nested: Record<string, unknown> = {};
      const existingNested = isPlainObject(existingValue) ? existingValue : {};
      for (const [key, inner] of Object.entries(value)) {
        const resolved = resolveValue(inner, existingNested[key]);
        if (resolved !== DELETED) nested[key] = resolved;
      }
      return nested;
    }
    return value;
  }
}

export class FakeFirestore {
  /** Committed documents, keyed `collection/id`. */
  readonly docs = new Map<string, Record<string, unknown>>();
  /** Paths read inside a transaction, in order. */
  readonly reads: string[] = [];
  /** Writes that committed, in order. */
  readonly writes: FakeWrite[] = [];
  /** Every write staged, including those a later throw rolled back. */
  readonly staged: FakeWrite[] = [];
  /** Transaction bodies run so far. */
  transactionAttempts = 0;
  /** What `FieldValue.serverTimestamp()` resolves to on commit. */
  readonly commitTime: Timestamp;
  private autoIds = 0;

  constructor(
    seed: Record<string, Record<string, unknown>> = {},
    commitTime: Date = new Date('2026-09-02T12:00:00.000Z')
  ) {
    for (const [path, data] of Object.entries(seed)) this.docs.set(path, { ...data });
    this.commitTime = Timestamp.fromDate(commitTime);
  }

  collection(collectionId: string) {
    return {
      id: collectionId,
      doc: (id?: string): FakeDocumentReference => {
        // Only an omitted id consumes the counter, so `auto_1`, `auto_2`, … stay
        // legible in assertions no matter how many explicit refs were built.
        const docId = id ?? `auto_${(this.autoIds += 1)}`;
        return { id: docId, collectionId, path: `${collectionId}/${docId}` };
      },
    };
  }

  snapshot(ref: FakeDocumentReference): FakeDocumentSnapshot {
    const stored = this.docs.get(ref.path);
    return {
      id: ref.id,
      ref,
      exists: stored !== undefined,
      data: () => (stored === undefined ? undefined : { ...stored }),
      get: (field: string) => stored?.[field],
    };
  }

  async getAll(...refs: FakeDocumentReference[]): Promise<FakeDocumentSnapshot[]> {
    return refs.map((ref) => this.snapshot(ref));
  }

  /** Committed writes against one collection, e.g. `'audit_logs'`. */
  writesTo(collectionId: string): FakeWrite[] {
    return this.writes.filter((w) => w.collectionId === collectionId);
  }

  async runTransaction<T>(updateFn: (tx: FakeTransaction) => Promise<T> | T): Promise<T> {
    this.transactionAttempts += 1;
    const tx = new FakeTransaction(this);
    const result = await updateFn(tx);
    tx.commit();
    return result;
  }
}

/**
 * One transaction attempt. Reads see committed state only (never this
 * transaction's own pending writes, matching Firestore), and a read after the
 * first write fails the way the live client does.
 */
export class FakeTransaction {
  private hasWritten = false;
  private readonly pending: FakeWrite[] = [];

  constructor(private readonly db: FakeFirestore) {}

  async get(ref: FakeDocumentReference): Promise<FakeDocumentSnapshot> {
    this.assertReadPhase();
    this.db.reads.push(ref.path);
    return this.db.snapshot(ref);
  }

  async getAll(...refs: FakeDocumentReference[]): Promise<FakeDocumentSnapshot[]> {
    this.assertReadPhase();
    for (const ref of refs) this.db.reads.push(ref.path);
    return refs.map((ref) => this.db.snapshot(ref));
  }

  create(ref: FakeDocumentReference, data: Record<string, unknown>): this {
    return this.stage('create', ref, data, false);
  }

  set(ref: FakeDocumentReference, data: Record<string, unknown>, options?: { merge?: boolean }): this {
    return this.stage('set', ref, data, options?.merge === true);
  }

  update(ref: FakeDocumentReference, data: Record<string, unknown>): this {
    return this.stage('update', ref, data, true);
  }

  delete(ref: FakeDocumentReference): this {
    return this.stage('delete', ref, {}, false);
  }

  private assertReadPhase(): void {
    if (this.hasWritten) {
      // The exact production message from /api/bookings/cancel-self.
      throw new Error('Firestore transactions require all reads to be executed before all writes.');
    }
  }

  private stage(
    op: FakeWriteOp,
    ref: FakeDocumentReference,
    data: Record<string, unknown>,
    merge: boolean
  ): this {
    if (op !== 'delete') validatePayload(data);
    const write: FakeWrite = { op, path: ref.path, collectionId: ref.collectionId, data, merge };
    this.pending.push(write);
    this.db.staged.push(write);
    this.hasWritten = true;
    return this;
  }

  /** Applies pending writes and the preconditions Firestore checks at commit. */
  commit(): void {
    for (const write of this.pending) {
      const existing = this.db.docs.get(write.path);

      if (write.op === 'create' && existing !== undefined) {
        throw new Error(`6 ALREADY_EXISTS: entity already exists: ${write.path}`);
      }
      if (write.op === 'update' && existing === undefined) {
        throw new Error(`5 NOT_FOUND: no entity to update: ${write.path}`);
      }

      if (write.op === 'delete') {
        this.db.docs.delete(write.path);
      } else if (write.op === 'update') {
        const next = { ...(existing ?? {}) };
        const resolved = materialize(write.data, next, this.db.commitTime);
        for (const [key, value] of Object.entries(resolved)) assignPath(next, key, value);
        this.db.docs.set(write.path, next);
      } else {
        const base = write.merge ? { ...(existing ?? {}) } : {};
        const resolved = materialize(write.data, base, this.db.commitTime);
        for (const [key, value] of Object.entries(resolved)) assignPath(base, key, value);
        this.db.docs.set(write.path, base);
      }

      this.db.writes.push(write);
    }
    this.pending.length = 0;
  }
}

/**
 * Hands a `FakeTransaction` to production code typed against the phase aliases.
 *
 * The fake is structurally compatible in the ways that matter — `get`/`getAll`
 * take a ref and return a snapshot; `create`/`set`/`update`/`delete` stage a
 * write — but not nominally: a real `DocumentReference` carries dozens of members
 * (`firestore`, `parent`, `withConverter`, `listCollections`, …) that modelling
 * here would add nothing to, while `FakeDocumentReference` adds `collectionId` so
 * assertions can group writes by collection.
 *
 * The cast therefore lives here, once, rather than at each call site: a test that
 * exercises a production helper directly (`OutboxService.recordEventInTransaction`,
 * `SlotReservationService.releasePinInTransaction`, …) passes `asTxWriter(tx)` and
 * still gets the fake's rule enforcement. Tests that reach production code through
 * the mocked `@/lib/firebase/admin` module need neither adapter, since the mock is
 * already untyped at that boundary.
 */
export function asTxReader(tx: FakeTransaction): TxReader {
  return tx as unknown as TxReader;
}

/** The write-phase half of {@link asTxReader}; `tx.get` is not in scope on the result. */
export function asTxWriter(tx: FakeTransaction): TxWriter {
  return tx as unknown as TxWriter;
}
