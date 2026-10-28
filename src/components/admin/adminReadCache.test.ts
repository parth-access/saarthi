import { beforeEach, describe, expect, it } from 'vitest';
import { readAdminCache, setAdminCacheOwner, writeAdminCache } from './adminReadCache';

beforeEach(() => setAdminCacheOwner(null));

describe('adminReadCache', () => {
  it('holds nothing until an account owns it', () => {
    writeAdminCache('/api/admin/jobs', { a: 1 });
    expect(readAdminCache('/api/admin/jobs')).toBeNull();
  });

  it('returns the last reading for the same account', () => {
    setAdminCacheOwner('uid_1');
    writeAdminCache('/api/admin/jobs', { a: 1 });
    writeAdminCache('/api/admin/jobs', { a: 2 });
    expect(readAdminCache('/api/admin/jobs')).toEqual({ a: 2 });
  });

  it('forgets everything when the account changes', () => {
    setAdminCacheOwner('uid_1');
    writeAdminCache('/api/admin/jobs', { a: 1 });
    setAdminCacheOwner('uid_2');
    expect(readAdminCache('/api/admin/jobs')).toBeNull();
  });

  it('keeps a bounded number of readings, dropping the oldest', () => {
    setAdminCacheOwner('uid_1');
    for (let index = 0; index < 45; index += 1) writeAdminCache(`k${index}`, index);
    expect(readAdminCache('k0')).toBeNull();
    expect(readAdminCache('k44')).toBe(44);
  });
});
