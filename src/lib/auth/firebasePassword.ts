import crypto from 'crypto';
import { promisify } from 'util';
import { verifyPassword as verifyBetterAuthPassword } from 'better-auth/crypto';

const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions
) => Promise<Buffer>;

/**
 * Passwords imported from Firebase Auth keep their original hash, stored as
 * `firebase$<passwordHash>$<salt>` (both base64, exactly as `firebase auth:export`
 * prints them). Anything without the prefix is a native Better Auth hash.
 */
const PREFIX = 'firebase$';

/** The project-wide parameters from Firebase console → Authentication → Users → ⋮ → Password hash parameters. */
export interface FirebaseHashParams {
  signerKey: string;
  saltSeparator: string;
  rounds: number;
  memCost: number;
}

export function encodeFirebaseHash(passwordHash: string, salt: string): string {
  return `${PREFIX}${passwordHash}$${salt}`;
}

export function isFirebaseHash(hash: string): boolean {
  return hash.startsWith(PREFIX);
}

/**
 * Firebase's modified scrypt: scrypt(password, salt ‖ saltSeparator) gives an
 * AES-256-CTR key (zero IV) that encrypts the project's signer key; the
 * ciphertext is the stored hash. Mirrors github.com/firebase/scrypt.
 */
export async function verifyFirebasePassword(
  password: string,
  encoded: string,
  params: FirebaseHashParams
): Promise<boolean> {
  const [passwordHash, salt] = encoded.slice(PREFIX.length).split('$');
  if (!passwordHash || !salt) return false;

  const derivedKey = await scrypt(
    // Raw UTF-8, no normalisation: that is what Firebase hashed.
    password,
    Buffer.concat([Buffer.from(salt, 'base64'), Buffer.from(params.saltSeparator, 'base64')]),
    64,
    { N: 2 ** params.memCost, r: params.rounds, p: 1, maxmem: 256 * 1024 * 1024 }
  );
  const cipher = crypto.createCipheriv('aes-256-ctr', derivedKey.subarray(0, 32), Buffer.alloc(16, 0));
  const computed = Buffer.concat([cipher.update(Buffer.from(params.signerKey, 'base64')), cipher.final()]);
  const expected = Buffer.from(passwordHash, 'base64');
  return computed.length === expected.length && crypto.timingSafeEqual(computed, expected);
}

function firebaseHashParamsFromEnv(): FirebaseHashParams | null {
  const signerKey = process.env.FIREBASE_HASH_SIGNER_KEY;
  const saltSeparator = process.env.FIREBASE_HASH_SALT_SEPARATOR;
  const rounds = Number(process.env.FIREBASE_HASH_ROUNDS);
  const memCost = Number(process.env.FIREBASE_HASH_MEM_COST);
  if (!signerKey || !saltSeparator || !Number.isInteger(rounds) || !Number.isInteger(memCost)) {
    return null;
  }
  return { signerKey, saltSeparator, rounds, memCost };
}

/**
 * Better Auth's `emailAndPassword.password.verify`: imported Firebase hashes
 * are checked with Firebase's scheme, everything else with Better Auth's.
 * Without the hash parameters configured, imported accounts fail closed
 * (they can still reset their password).
 */
export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  if (!isFirebaseHash(hash)) {
    return verifyBetterAuthPassword({ hash, password });
  }
  const params = firebaseHashParamsFromEnv();
  if (!params) {
    console.error('Firebase password hash parameters are not configured; refusing legacy password sign-in.');
    return false;
  }
  return verifyFirebasePassword(password, hash, params);
}
