/**
 * Sets a Better Auth user's role by email, and mirrors it to Firestore
 * users/{id} for the admin console's lists. For the first admin, who can't
 * use the console yet; after that, use Users & roles in the console.
 *
 *   npx tsx scripts/migrations/set-role.mts --email you@example.com --role admin           # dry run
 *   npx tsx scripts/migrations/set-role.mts --email you@example.com --role admin --apply   # write
 *
 * The person must have signed up first. Reads DATABASE_URL and
 * FIREBASE_ADMIN_KEY_BASE64 from the environment or .env.local. Their current
 * sessions are ended so the new role applies on their next sign-in.
 */
import fs from 'node:fs';
import admin from 'firebase-admin';
import pg from 'pg';
import { poolSsl } from '../../src/lib/auth/betterAuth';

const ROLES = ['client', 'therapist', 'admin'] as const;

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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const email = arg('email')?.trim().toLowerCase();
const role = arg('role') as (typeof ROLES)[number] | undefined;
const apply = process.argv.includes('--apply');

if (!email || !role || !ROLES.includes(role)) {
  console.error('Usage: --email <address> --role client|therapist|admin [--apply]');
  process.exit(1);
}

const databaseUrl = env('DATABASE_URL');
const client = new pg.Client({ connectionString: databaseUrl, ssl: poolSsl(databaseUrl) });
await client.connect();

try {
  const found = await client.query<{ id: string; role: string | null; banned: boolean | null }>(
    'select "id", "role", "banned" from "user" where lower("email") = $1',
    [email]
  );
  if (found.rowCount === 0) {
    console.error(`No Better Auth account for ${email}. They need to sign up first.`);
    process.exitCode = 1;
  } else {
    const user = found.rows[0];
    console.log(`Account ${user.id}: role ${user.role ?? 'client'} -> ${role}${user.banned ? ' (note: this account is banned)' : ''}`);
    if (!apply) {
      console.log('\nDry run: nothing written. Re-run with --apply to change it.');
    } else {
      await client.query('begin');
      await client.query('update "user" set "role" = $1, "updatedAt" = now() where "id" = $2', [role, user.id]);
      await client.query('delete from "session" where "userId" = $1', [user.id]);
      await client.query('commit');

      const serviceAccount = JSON.parse(Buffer.from(env('FIREBASE_ADMIN_KEY_BASE64'), 'base64').toString('utf8'));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      await admin.firestore().collection('users').doc(user.id).set({ role, updatedAt: admin.firestore.Timestamp.now() }, { merge: true });

      console.log(`\nDone. ${email} is now ${role}; they need to sign in again.`);
    }
  }
} catch (err) {
  await client.query('rollback').catch(() => {});
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
process.exit();
