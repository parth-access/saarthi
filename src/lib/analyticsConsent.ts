/**
 * Analytics consent state for Saarthi.
 *
 * Google Analytics must not load until a visitor has said yes. The choice is
 * remembered in this browser (localStorage) so we only ask once, and can be
 * changed any time from the footer ("Cookie settings").
 *
 * Everything here is SSR-safe (no-ops on the server) and never throws: if
 * storage is blocked (private mode, strict browser settings) the choice is held
 * in memory for the current visit instead.
 */

export type AnalyticsConsent = "granted" | "denied";

/** What components see: "unknown" only before the browser has been read. */
export type AnalyticsConsentState = AnalyticsConsent | "unset" | "unknown";

export const CONSENT_STORAGE_KEY = "saarthi_analytics_consent_v1";
const CHANGE_EVENT = "saarthi:analytics-consent-change";
const OPEN_EVENT = "saarthi:open-consent-preferences";

// Fallback when localStorage is unavailable.
let memoryChoice: AnalyticsConsent | null = null;

function getStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null; // Accessing localStorage can itself throw.
  }
}

function isConsent(value: unknown): value is AnalyticsConsent {
  return value === "granted" || value === "denied";
}

/** The stored choice, or null if the visitor has not decided yet. */
export function readStoredConsent(): AnalyticsConsent | null {
  const storage = getStorage();
  if (storage) {
    try {
      const raw = storage.getItem(CONSENT_STORAGE_KEY);
      if (isConsent(raw)) return raw;
      // Anything else (missing, corrupted, older format) counts as "not decided".
      return null;
    } catch {
      /* fall through to memory */
    }
  }
  return memoryChoice;
}

export function saveConsent(value: AnalyticsConsent): void {
  memoryChoice = value;
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(CONSENT_STORAGE_KEY, value);
    } catch {
      /* quota / blocked: memory fallback already set */
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

/** Subscribe to consent changes (same tab and other tabs). Returns unsubscribe. */
export function subscribeConsent(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === CONSENT_STORAGE_KEY) callback();
  };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

/** Snapshot for useSyncExternalStore (client). */
export function getConsentSnapshot(): AnalyticsConsentState {
  return readStoredConsent() ?? "unset";
}

/** Snapshot for useSyncExternalStore (server / first hydration render). */
export function getServerConsentSnapshot(): AnalyticsConsentState {
  return "unknown";
}

/** Ask the notice to open so the visitor can review or change their choice. */
export function openConsentPreferences(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onOpenConsentPreferences(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OPEN_EVENT, callback);
  return () => window.removeEventListener(OPEN_EVENT, callback);
}

/**
 * Remove Google Analytics cookies (`_ga`, `_ga_<ID>`, `_gid`, `_gat*`).
 * GA sets them on the registrable domain, so try the host and every parent.
 */
export function clearGoogleAnalyticsCookies(
  doc: Pick<Document, "cookie"> | undefined = typeof document === "undefined" ? undefined : document,
  hostname: string | undefined = typeof location === "undefined" ? undefined : location.hostname
): void {
  if (!doc) return;
  let names: string[] = [];
  try {
    names = doc.cookie
      .split(";")
      .map((part) => part.split("=")[0].trim())
      .filter((name) => /^(_ga($|_)|_gid$|_gat)/.test(name));
  } catch {
    return;
  }
  if (names.length === 0) return;

  const domains: Array<string | undefined> = [undefined];
  if (hostname && hostname.includes(".") && !/^\d+(\.\d+){3}$/.test(hostname)) {
    const labels = hostname.split(".");
    for (let i = 0; i <= labels.length - 2; i += 1) {
      const suffix = labels.slice(i).join(".");
      domains.push(suffix, `.${suffix}`);
    }
  }

  for (const name of names) {
    for (const domain of domains) {
      const domainPart = domain ? `; domain=${domain}` : "";
      doc.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; path=/${domainPart}`;
    }
  }
}
