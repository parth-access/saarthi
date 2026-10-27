import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate, mockDoc } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  return { mockCreate, mockDoc: vi.fn(() => ({ create: mockCreate })) };
});

vi.mock('../firebase/admin', () => ({ adminDb: { collection: () => ({ doc: mockDoc }) } }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'SERVER_TS' } }));

import { createUserProfile } from './userProfile';

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue(undefined);
});

describe('createUserProfile', () => {
  it('creates a client profile keyed by the Better Auth user id', async () => {
    await createUserProfile({ id: 'u1', email: 'a@x.com', name: ' Asha ' }, 'credential');
    expect(mockDoc).toHaveBeenCalledWith('u1');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'u1', email: 'a@x.com', name: 'Asha', role: 'client', provider: 'credential', totalSessions: 0, activeBookings: 0 })
    );
  });

  it('names a nameless user "User"', async () => {
    await createUserProfile({ id: 'u1', email: 'a@x.com', name: '' }, 'google');
    expect(mockCreate.mock.calls[0][0].name).toBe('User');
  });

  it('leaves an existing profile alone and does not throw', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('exists'), { code: 6 }));
    await expect(createUserProfile({ id: 'u1', email: 'a@x.com' }, 'credential')).resolves.toBeUndefined();
  });

  it('does not throw when Firestore fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreate.mockRejectedValue(new Error('unavailable'));
    await expect(createUserProfile({ id: 'u1', email: 'a@x.com' }, 'credential')).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
