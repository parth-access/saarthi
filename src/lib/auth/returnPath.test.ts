import { describe, expect, it } from 'vitest';
import { getLoginRedirectPath, getSafeReturnPath } from './returnPath';

describe('getLoginRedirectPath', () => {
  it('encodes the protected pathname and query as one next value', () => {
    expect(getLoginRedirectPath('/admin/bookings', '?status=pending')).toBe(
      '/login?next=%2Fadmin%2Fbookings%3Fstatus%3Dpending'
    );
  });

  it('does not add a query marker when the original URL has no query', () => {
    expect(getLoginRedirectPath('/dashboard', '')).toBe(
      '/login?next=%2Fdashboard'
    );
  });
});

describe('getSafeReturnPath', () => {
  it.each([
    ['/dashboard', 'client'],
    ['/dashboard/bookings?status=pending&sort=soon', 'client'],
    ['/therapist/bookings?date=2026-10-01', 'therapist'],
    ['/admin', 'admin'],
    ['/admin/users?page=2', 'admin'],
    ['/dashboard/profile?name=Jane%20Doe', 'admin'],
  ])('allows protected return path %s for %s', (path, role) => {
    expect(getSafeReturnPath(path, role)).toBe(path);
  });

  it.each([
    ['/admin', 'client'],
    ['/therapist', 'client'],
    ['/dashboard', 'therapist'],
    ['/admin', 'therapist'],
    ['/therapist', 'admin'],
    ['/dashboard', 'unknown'],
    ['/dashboard', '__proto__'],
  ])('rejects role-ineligible path %s for %s', (path, role) => {
    expect(getSafeReturnPath(path, role)).toBeNull();
  });

  it.each([
    null,
    undefined,
    '',
    'https://evil.example/admin',
    '//evil.example/admin',
    '/admin\\evil',
    '/admin//evil',
    '/admin\n/users',
    '/admin/users?name=%0Aadmin',
    '/admin#users',
    '/admin/%ZZ',
    '/admin/%2e%2e/dashboard',
    '/admin/%252e%252e/dashboard',
    '/admin%2F..%2Fdashboard',
    '/admin/%2525252f%2525252fevil.example',
    '/%61dmin',
    '/administrator',
    '/dashboardish',
  ])('rejects unsafe or non-protected value %s', (value) => {
    expect(getSafeReturnPath(value, 'admin')).toBeNull();
  });

  it('rejects overlong return paths', () => {
    expect(getSafeReturnPath(`/dashboard/${'a'.repeat(2048)}`, 'client')).toBeNull();
  });
});
