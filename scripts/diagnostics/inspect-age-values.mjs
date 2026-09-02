/**
 * READ-ONLY diagnostic: reports the shape and distribution of `age` on every
 * document in the `bookings` collection.
 *
 * Writes nothing. Prints no therapy content (no `message` field) and masks
 * client identity to a short hash so the output can be pasted into a report.
 *
 *   node scripts/diagnostics/inspect-age-values.mjs
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import admin from 'firebase-admin';

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
}

loadEnv();

const b64 = process.env.FIREBASE_ADMIN_KEY_BASE64;
if (!b64) {
  console.error('FIREBASE_ADMIN_KEY_BASE64 is not set; cannot inspect production data.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))),
});

const db = admin.firestore();
const mask = (s) => (s ? crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 6) : '—');

// Must match MIN_CLIENT_AGE / MAX_CLIENT_AGE in src/shared/constants/index.ts.
// Kept as literals because this is a plain .mjs script outside the TS build.
const MIN_CLIENT_AGE = 13;
const MAX_CLIENT_AGE = 120;

const snap = await db.collection('bookings').get();
const buckets = new Map();
const rows = [];

for (const doc of snap.docs) {
  const d = doc.data();
  const raw = d.age;
  const type = raw === undefined ? 'undefined' : raw === null ? 'null' : typeof raw;
  // Mirrors `parseAgeInput`: digits only, no `parseInt` leniency, so this report
  // classifies exactly what the application now accepts.
  const numeric =
    typeof raw === 'number' ? (Number.isInteger(raw) ? raw : NaN)
    : typeof raw === 'string' && /^\d{1,3}$/.test(raw.trim()) ? Number(raw.trim())
    : NaN;
  const plausible = Number.isFinite(numeric) && numeric >= MIN_CLIENT_AGE && numeric <= MAX_CLIENT_AGE;
  const key = `${type}${plausible ? ' (plausible)' : ' (IMPLAUSIBLE/MISSING)'}`;
  buckets.set(key, (buckets.get(key) || 0) + 1);
  if (!plausible) {
    rows.push({
      id: doc.id,
      client: mask(d.email),
      raw: JSON.stringify(raw),
      type,
      status: d.status,
      date: d.date,
      createdAt: d.createdAt?.toDate?.()?.toISOString?.() ?? String(d.createdAt),
    });
  }
}

console.log(`\nbookings scanned: ${snap.size}\n`);
console.log('age field distribution:');
for (const [k, v] of [...buckets].sort()) console.log(`  ${String(v).padStart(4)}  ${k}`);

console.log(`\nnon-plausible / missing age values (${rows.length}):`);
for (const r of rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
  console.log(`  ${r.id}  client=${r.client}  age=${r.raw} (${r.type})  status=${r.status}  session=${r.date}  created=${r.createdAt}`);
}

console.log(
  '\nNo documents were modified. This script only reports.\n' +
  'A backfill is NOT possible from this data: the true age of a client whose\n' +
  'record holds a fabricated value is not recoverable from the booking document,\n' +
  'so any "fix" would be a second invention. The intended remediation is to leave\n' +
  'historical values in place and let the UI mark them "(unverified)" — see\n' +
  '`formatAgeLabel` in TherapistDashboard.tsx — so an admin can re-confirm the age\n' +
  'with the client instead of trusting a number the old code made up.'
);
process.exit(0);
