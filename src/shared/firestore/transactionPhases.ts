/**
 * Firestore transaction phase discipline.
 *
 * Firestore requires **all reads before all writes** inside a transaction.
 * Production hit the violation as:
 *
 *   Firestore transactions require all reads to be executed before all writes.
 *     at Transaction.get → SlotReservationService.releasePinInTransaction
 *
 * The failure mode is subtle because the offending read lived inside a helper
 * that was called late in the transaction body — nothing at the call site
 * looked like a read. Comments and code review do not prevent that.
 *
 * So the rule is encoded in the type system instead. `runPlannedTransaction`
 * hands the read phase a handle that can ONLY read, and the write phase a
 * handle that can ONLY write. A helper that needs a read must accept `TxReader`
 * and therefore cannot be called from the write phase: `plan.get is not a
 * function` becomes `Property 'get' does not exist on type 'TxWriter'` at
 * compile time.
 *
 * Convention for helpers that must do both: expose a `readXPlan(reader, …)`
 * that returns a plain plan object, and an `applyX(writer, plan)` that only
 * writes. See `SlotReservationService.readPinReleasePlan` / `applyPinRelease`.
 */
import type { Firestore, Transaction } from 'firebase-admin/firestore';

/** Read-only view of a transaction. Valid only during the read phase. */
export type TxReader = Pick<Transaction, 'get' | 'getAll'>;

/** Write-only view of a transaction. Valid only during the write phase. */
export type TxWriter = Pick<Transaction, 'create' | 'set' | 'update' | 'delete'>;

export interface TransactionPhases<TPlan, TResult> {
  /**
   * Every `transaction.get` for the whole operation happens here. Guards and
   * validation belong here too: throwing during the read phase aborts before
   * anything has been written.
   */
  read: (reader: TxReader) => Promise<TPlan>;
  /**
   * Applies the plan. Only writes are reachable through `writer`; anything that
   * needed a read had to happen in `read`.
   */
  write: (writer: TxWriter, plan: TPlan) => Promise<TResult> | TResult;
}

/**
 * Runs a Firestore transaction split into an explicit read phase and write
 * phase, so the "all reads before all writes" rule holds by construction.
 */
export async function runPlannedTransaction<TPlan, TResult>(
  db: Firestore,
  phases: TransactionPhases<TPlan, TResult>
): Promise<TResult> {
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }
  return db.runTransaction(async (transaction) => {
    const plan = await phases.read(transaction);
    return phases.write(transaction, plan);
  });
}
