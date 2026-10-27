import { describe, it, expect } from 'vitest';
import { poolSsl } from './betterAuth';
import { SUPABASE_ROOT_CA } from './supabaseCa';

describe('poolSsl', () => {
  it('verifies Supabase pooler and direct hosts against the Supabase root CA', () => {
    expect(poolSsl('postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres')).toEqual({ ca: SUPABASE_ROOT_CA });
    expect(poolSsl('postgresql://postgres:pw@db.ref.supabase.co:5432/postgres')).toEqual({ ca: SUPABASE_ROOT_CA });
  });

  it('leaves a local database alone', () => {
    expect(poolSsl('postgresql:///saarthi_auth_dev')).toBeUndefined();
    expect(poolSsl('postgresql://localhost:5432/saarthi')).toBeUndefined();
    expect(poolSsl(undefined)).toBeUndefined();
  });

  it('does not trust a look-alike host', () => {
    expect(poolSsl('postgresql://u:p@evil-supabase.com.example.net/db')).toBeUndefined();
  });

  it('embeds a real PEM certificate', () => {
    expect(SUPABASE_ROOT_CA).toContain('-----BEGIN CERTIFICATE-----');
    expect(SUPABASE_ROOT_CA).toContain('-----END CERTIFICATE-----');
  });
});
