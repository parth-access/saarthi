import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Mod = typeof import('./analyticsConsent');

function makeWindow(storage: unknown) {
  const target = new EventTarget();
  return Object.assign(target, { localStorage: storage }) as unknown as Window;
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

async function load(storage: unknown): Promise<Mod> {
  vi.resetModules();
  vi.stubGlobal('window', makeWindow(storage));
  return import('./analyticsConsent');
}

afterEach(() => vi.unstubAllGlobals());

describe('analytics consent storage', () => {
  it('starts undecided, then remembers grant and deny', async () => {
    const storage = memoryStorage();
    const m = await load(storage);
    expect(m.readStoredConsent()).toBeNull();
    expect(m.getConsentSnapshot()).toBe('unset');
    m.saveConsent('granted');
    expect(m.readStoredConsent()).toBe('granted');
    m.saveConsent('denied');
    expect(m.getConsentSnapshot()).toBe('denied');
    expect(storage.data[m.CONSENT_STORAGE_KEY]).toBe('denied');
  });

  it('treats corrupted or unknown stored values as undecided (never as consent)', async () => {
    const m0 = await load(memoryStorage());
    for (const bad of ['true', 'yes', 'GRANTED', '', '1', '{"a":1}']) {
      const m = await load(memoryStorage({ [m0.CONSENT_STORAGE_KEY]: bad }));
      expect(m.readStoredConsent()).toBeNull();
    }
  });

  it('notifies subscribers on change and stops after unsubscribe', async () => {
    const m = await load(memoryStorage());
    const cb = vi.fn();
    const off = m.subscribeConsent(cb);
    m.saveConsent('granted');
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    m.saveConsent('denied');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('keeps the choice for the visit when storage throws', async () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const m = await load(throwing);
    expect(m.readStoredConsent()).toBeNull();
    expect(() => m.saveConsent('denied')).not.toThrow();
    expect(m.readStoredConsent()).toBe('denied');
  });

  it('is a safe no-op on the server', async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    const m = await import('./analyticsConsent');
    expect(m.readStoredConsent()).toBeNull();
    expect(() => m.saveConsent('granted')).not.toThrow();
    expect(m.getServerConsentSnapshot()).toBe('unknown');
    expect(() => m.subscribeConsent(() => {})()).not.toThrow();
  });

  it('opens preferences via an event', async () => {
    const m = await load(memoryStorage());
    const cb = vi.fn();
    const off = m.onOpenConsentPreferences(cb);
    m.openConsentPreferences();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('clearGoogleAnalyticsCookies', () => {
  let writes: string[];
  let doc: { cookie: string };
  beforeEach(() => {
    writes = [];
    doc = {
      get cookie() {
        return '_ga=GA1.1.1; _ga_ABC123=GS1; _gid=x; __session=secret; theme=dark';
      },
      set cookie(v: string) {
        writes.push(v);
      },
    };
  });

  it('expires only Google Analytics cookies, on host and parent domains', async () => {
    const m = await load(memoryStorage());
    m.clearGoogleAnalyticsCookies(doc, 'www.saarthilife.com');
    const names = new Set(writes.map((w) => w.split('=')[0]));
    expect(names).toEqual(new Set(['_ga', '_ga_ABC123', '_gid']));
    expect(writes.some((w) => w.includes('domain=.saarthilife.com'))).toBe(true);
    expect(writes.some((w) => w.includes('domain=www.saarthilife.com'))).toBe(true);
    expect(writes.every((w) => w.includes('max-age=0'))).toBe(true);
    expect(writes.join('|')).not.toContain('__session');
    expect(writes.join('|')).not.toContain('theme');
  });

  it('does nothing when there are no GA cookies, and handles localhost/IPs', async () => {
    const m = await load(memoryStorage());
    m.clearGoogleAnalyticsCookies({ cookie: 'a=1; b=2' }, 'www.saarthilife.com');
    const spy: string[] = [];
    const d = { get cookie() { return '_ga=1'; }, set cookie(v: string) { spy.push(v); } };
    m.clearGoogleAnalyticsCookies(d, 'localhost');
    m.clearGoogleAnalyticsCookies(d, '127.0.0.1');
    expect(spy.every((w) => !w.includes('domain='))).toBe(true);
  });
});
