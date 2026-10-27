import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hashPassword } from 'better-auth/crypto';
import {
  encodeFirebaseHash,
  isFirebaseHash,
  verifyFirebasePassword,
  verifyPassword,
  type FirebaseHashParams,
} from './firebasePassword';

/** The published test vector from github.com/firebase/scrypt. */
const PARAMS: FirebaseHashParams = {
  signerKey: 'jxspr8Ki0RYycVU8zykbdLGjFQ3McFUH0uiiTvC8pVMXAn210wjLNmdZJzxUECKbm0QsEmYUSDzZvpjeJ9WmXA==',
  saltSeparator: 'Bw==',
  rounds: 8,
  memCost: 14,
};
const SALT = '42xEC+ixf3L2lw==';
const HASH = 'lSrfV15cpx95/sZS2W9c9Kp6i/LVgQNDNC/qzrCnh1SAyZvqmZqAjTdn3aoItz+VHjoZilo78198JAdRuid5lQ==';
const ENCODED = encodeFirebaseHash(HASH, SALT);

describe('Firebase password hashes', () => {
  it('accepts the correct password for an imported hash', async () => {
    expect(await verifyFirebasePassword('user1password', ENCODED, PARAMS)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    expect(await verifyFirebasePassword('user1Password', ENCODED, PARAMS)).toBe(false);
  });

  it('rejects when the project parameters differ', async () => {
    expect(await verifyFirebasePassword('user1password', ENCODED, { ...PARAMS, rounds: 7 })).toBe(false);
  });

  it('rejects a malformed encoded hash', async () => {
    expect(await verifyFirebasePassword('user1password', 'firebase$onlyonepart', PARAMS)).toBe(false);
  });

  it('only treats prefixed hashes as Firebase hashes', async () => {
    expect(isFirebaseHash(ENCODED)).toBe(true);
    expect(isFirebaseHash(await hashPassword('anything-long'))).toBe(false);
  });
});

describe('verifyPassword (Better Auth hook)', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.FIREBASE_HASH_SIGNER_KEY = PARAMS.signerKey;
    process.env.FIREBASE_HASH_SALT_SEPARATOR = PARAMS.saltSeparator;
    process.env.FIREBASE_HASH_ROUNDS = String(PARAMS.rounds);
    process.env.FIREBASE_HASH_MEM_COST = String(PARAMS.memCost);
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('verifies imported Firebase hashes with the configured parameters', async () => {
    expect(await verifyPassword({ hash: ENCODED, password: 'user1password' })).toBe(true);
    expect(await verifyPassword({ hash: ENCODED, password: 'nope' })).toBe(false);
  });

  it('verifies native Better Auth hashes with Better Auth', async () => {
    const native = await hashPassword('a-native-password');
    expect(await verifyPassword({ hash: native, password: 'a-native-password' })).toBe(true);
    expect(await verifyPassword({ hash: native, password: 'wrong-password' })).toBe(false);
  });

  it('fails closed for imported hashes when parameters are missing', async () => {
    delete process.env.FIREBASE_HASH_SIGNER_KEY;
    expect(await verifyPassword({ hash: ENCODED, password: 'user1password' })).toBe(false);
  });
});
