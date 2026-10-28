/**
 * The last successful reading of each admin list, kept in memory for the tab.
 *
 * Going back to a section paints what it showed last time immediately and
 * refreshes it behind that, instead of blanking to a skeleton on every visit.
 * That is honest only because every payload carries its own `generatedAtIso`,
 * which each screen prints as "read at …", and because the screens already
 * render a refetch over the previous rows. Nothing here is persisted: a reload
 * starts empty.
 *
 * Detail screens, where actions are taken, deliberately do not use it.
 */

const MAX_ENTRIES = 40;

const store = new Map<string, unknown>();
let owner: string | null = null;

/**
 * Ties the cache to the signed-in account. A different account in the same
 * tab starts from nothing rather than seeing what the previous one read.
 */
export function setAdminCacheOwner(uid: string | null): void {
  if (uid === owner) return;
  owner = uid;
  store.clear();
}

export function readAdminCache<T>(key: string): T | null {
  if (owner === null) return null;
  return store.has(key) ? (store.get(key) as T) : null;
}

export function writeAdminCache(key: string, value: unknown): void {
  if (owner === null) return;
  // Re-inserted so the map's order is least-recently-written first.
  store.delete(key);
  store.set(key, value);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}
