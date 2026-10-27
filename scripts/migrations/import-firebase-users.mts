/**
 * Copies Firebase Auth users into the Better Auth tables (Supabase), keeping
 * their uid and their Firebase password hash. Safe to re-run: rows that
 * already exist are left alone, so the same command loads the delta at
 * cutover.
 *
 *   npx tsx scripts/migrations/import-firebase-users.mts            # dry run: counts only
 *   npx tsx scripts/migrations/import-firebase-users.mts --apply    # write
 *
 * Reads DATABASE_URL and FIREBASE_ADMIN_KEY_BASE64 from the environment or
 * .env.local. Prints counts and uids only, never emails or hashes.
 */
import fs from 'node:fs';
import admin from 'firebase-admin';
import pg from 'pg';
import { planFirebaseImport, type FirebaseUserLike, type FirestoreUserDocLike } from '../../src/lib/auth/firebaseImport';
import { poolSsl } from '../../src/lib/auth/betterAuth';

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const line = fs.existsSync('.env.local')
    ? fs.readFileSync('.env.local', 'utf8').split('\n').find((l) => l.startsWith(`${name}=`))
    : undefined;
  const value = line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  if (!value) {
    console.error(`${name} is not set (environment or .env.local).`);
    process.exit(1);
  }
  return value;
}

const apply = process.argv.includes('--apply');
const databaseUrl = env('DATABASE_URL');
const serviceAccount = JSON.parse(Buffer.from(env('FIREBASE_ADMIN_KEY_BASE64'), 'base64').toString('utf8'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// 1. Every Firebase Auth user, with password hashes (the Admin SDK service
//    account is allowed to read them).
const firebaseUsers: FirebaseUserLike[] = [];
let pageToken: string | undefined;
do {
  const page = await admin.auth().listUsers(1000, pageToken);
  firebaseUsers.push(...(page.users as unknown as FirebaseUserLike[]));
  pageToken = page.pageToken;
} while (pageToken);

// 2. Their Firestore profiles, for role and ban state.
const docs = new Map<string, FirestoreUserDocLike>();
const refs = firebaseUsers.map((u) => admin.firestore().collection('users').doc(u.uid));
for (let i = 0; i < refs.length; i += 300) {
  const snaps = await admin.firestore().getAll(...refs.slice(i, i + 300));
  for (const snap of snaps) if (snap.exists) docs.set(snap.id, snap.data() as FirestoreUserDocLike);
}

const plan = planFirebaseImport(firebaseUsers, docs);
const count = (pred: (u: (typeof plan.users)[number]) => boolean) => plan.users.filter(pred).length;

console.log(`Firebase users:        ${firebaseUsers.length}`);
console.log(`  to import:           ${plan.users.length}`);
console.log(`    admins:            ${count((u) => u.role === 'admin')}`);
console.log(`    therapists:        ${count((u) => u.role === 'therapist')}`);
console.log(`    banned/disabled:   ${count((u) => u.banned)}`);
console.log(`    email verified:    ${count((u) => u.emailVerified)}`);
console.log(`  password accounts:   ${plan.accounts.filter((a) => a.providerId === 'credential').length}`);
console.log(`  Google accounts:     ${plan.accounts.filter((a) => a.providerId === 'google').length}`);
console.log(`  without Firestore profile: ${firebaseUsers.filter((u) => !docs.has(u.uid)).length}`);
for (const s of plan.skipped) console.log(`  skipped ${s.uid}: ${s.reason}`);

if (!apply) {
  console.log('\nDry run: nothing written. Re-run with --apply to import.');
  process.exit(0);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: poolSsl(databaseUrl) });
await client.connect();
try {
  await client.query('begin');
  let usersInserted = 0;
  for (const u of plan.users) {
    // No conflict target: an existing id OR email leaves the row untouched.
    const r = await client.query(
      `insert into "user" ("id","name","email","emailVerified","image","createdAt","updatedAt","role","banned","banReason")
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing`,
      [u.id, u.name, u.email, u.emailVerified, u.image, u.createdAt, u.updatedAt, u.role, u.banned, u.banReason]
    );
    usersInserted += r.rowCount ?? 0;
  }
  let accountsInserted = 0;
  for (const a of plan.accounts) {
    // Only for users that exist (a user skipped above by an email clash has none).
    const r = await client.query(
      `insert into "account" ("id","accountId","providerId","userId","password","createdAt","updatedAt")
       select $1,$2,$3,$4,$5,$6,$7 where exists (select 1 from "user" where "id" = $4)
       on conflict do nothing`,
      [a.id, a.accountId, a.providerId, a.userId, a.password, a.createdAt, a.updatedAt]
    );
    accountsInserted += r.rowCount ?? 0;
  }
  await client.query('commit');
  console.log(`\nImported: ${usersInserted} users, ${accountsInserted} accounts (existing rows left unchanged).`);
} catch (err) {
  await client.query('rollback');
  console.error('Import failed and was rolled back:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
process.exit();
