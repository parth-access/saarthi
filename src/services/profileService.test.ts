import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  userDoc: null as null | Record<string, unknown>,
  bookings: [] as Array<Record<string, unknown>>,
  setDoc: vi.fn(),
  updateProfile: vi.fn(),
  currentUser: { displayName: 'Old', providerData: [{ providerId: 'password' }] },
}));

vi.mock('@/lib/firebase/client', () => ({ auth: { get currentUser() { return h.currentUser; } } }));
vi.mock('@/lib/firebase/firestore', () => ({ db: {} }));
vi.mock('firebase/auth', () => ({ updateProfile: h.updateProfile }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  getDoc: async () => ({ exists: () => h.userDoc !== null, data: () => h.userDoc }),
  getDocs: async () => ({ docs: h.bookings.map((d) => ({ data: () => d })) }),
  setDoc: h.setDoc,
}));

import { profileService } from './profileService';

const user = { uid: 'u1', email: 'a@x.com' };

beforeEach(() => {
  vi.clearAllMocks();
  h.userDoc = null;
  h.bookings = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('profileService (Firebase)', () => {
  it('reads users/{uid} and the password sign-in method', async () => {
    h.userDoc = { name: 'Asha', phone: '98', bio: 'b' };
    expect(await profileService.load(user)).toEqual({ name: 'Asha', phone: '98', bio: 'b', usesPassword: true });
  });

  it('falls back to the latest booking when the profile is empty', async () => {
    h.bookings = [{ name: 'Old', createdAt: { seconds: 1 } }, { name: 'New', phone: '2', createdAt: { seconds: 2 } }];
    expect(await profileService.load(user)).toMatchObject({ name: 'New', phone: '2' });
  });

  it('saves to users/{uid} and keeps the display name in step', async () => {
    await profileService.save(user, { name: 'Asha', phone: '', bio: '' });
    expect(h.setDoc).toHaveBeenCalledWith({}, expect.objectContaining({ name: 'Asha', email: 'a@x.com' }), { merge: true });
    expect(h.updateProfile).toHaveBeenCalledWith(h.currentUser, { displayName: 'Asha' });
  });
});

describe('profileService (Better Auth)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_PROVIDER', 'better-auth');
  });

  it('loads through /api/me/profile', async () => {
    const profile = { name: 'Asha', phone: '', bio: '', usesPassword: false };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => profile });
    vi.stubGlobal('fetch', fetchMock);
    expect(await profileService.load(user)).toEqual(profile);
    expect(fetchMock).toHaveBeenCalledWith('/api/me/profile', { cache: 'no-store' });
  });

  it('saves through PATCH /api/me/profile and never writes Firestore', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await profileService.save(user, { name: 'Asha', phone: '98', bio: '' });
    expect(fetchMock).toHaveBeenCalledWith('/api/me/profile', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Asha', phone: '98', bio: '' }) }));
    expect(h.setDoc).not.toHaveBeenCalled();
  });

  it('throws when the API refuses, so the page can say so', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(profileService.load(user)).rejects.toThrow('500');
  });
});
