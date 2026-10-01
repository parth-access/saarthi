import { afterEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

const originalSecret = process.env.JWT_SECRET;

async function sessionFor(role: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return new SignJWT({ uid: `${role}-user`, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalSecret;
  }
});

describe('middleware return paths', () => {
  it.each([
    ['/dashboard', '/login?next=%2Fdashboard'],
    ['/therapist', '/login?next=%2Ftherapist'],
    ['/therapist/sessions', '/login?next=%2Ftherapist%2Fsessions'],
    ['/admin', '/login?next=%2Fadmin'],
    ['/admin/bookings', '/login?next=%2Fadmin%2Fbookings'],
  ])('retains the signed-out destination %s', async (path, expected) => {
    const response = await middleware(new NextRequest(`https://saarthilife.com${path}`));
    expect(response.headers.get('location')).toBe(`https://saarthilife.com${expected}`);
  });

  it('preserves pathname and query when a protected request has no cookie', async () => {
    const response = await middleware(
      new NextRequest(
        'https://saarthilife.com/admin/bookings?status=pending&sort=soon'
      )
    );

    expect(response.headers.get('location')).toBe(
      'https://saarthilife.com/login?next=%2Fadmin%2Fbookings%3Fstatus%3Dpending%26sort%3Dsoon'
    );
  });

  it('preserves the return path and clears an invalid session cookie', async () => {
    process.env.JWT_SECRET = 'middleware-test-secret';
    const response = await middleware(
      new NextRequest('https://saarthilife.com/therapist/bookings?day=monday', {
        headers: { cookie: '__session=invalid-token' },
      })
    );

    expect(response.headers.get('location')).toBe(
      'https://saarthilife.com/login?next=%2Ftherapist%2Fbookings%3Fday%3Dmonday'
    );
    expect(response.headers.get('set-cookie') ?? '').toContain('__session=');
  });

  it('continues a valid signed-in request for an eligible protected route', async () => {
    process.env.JWT_SECRET = 'middleware-test-secret';
    const token = await sessionFor('admin');
    const response = await middleware(
      new NextRequest('https://saarthilife.com/admin/bookings?status=pending', {
        headers: { cookie: `__session=${token}` },
      })
    );

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('keeps the existing role-mismatch redirect for signed-in users', async () => {
    process.env.JWT_SECRET = 'middleware-test-secret';
    const token = await sessionFor('client');
    const response = await middleware(
      new NextRequest('https://saarthilife.com/admin/bookings', {
        headers: { cookie: `__session=${token}` },
      })
    );

    expect(response.headers.get('location')).toBe(
      'https://saarthilife.com/dashboard'
    );
  });
});
