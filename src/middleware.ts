import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // PROD ARCHITECTURE PREPARATION:
  // Eventually, this token should be a securely decoded JWT validating custom claims (e.g., role).
  const session = request.cookies.get('__session')?.value;

  const { pathname } = request.nextUrl;

  const isAdminPath = pathname.startsWith('/admin');
  const isTherapistPath = pathname.startsWith('/therapist');
  const isDashboardPath = pathname.startsWith('/dashboard');
  const isProtectedPath = isAdminPath || isTherapistPath || isDashboardPath;
  const isAuthPath = pathname.startsWith('/login');

  if (isProtectedPath && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // TODO: Add strict role authorization using edge-compatible JWT decoding or session introspection.
  // if (isAdminPath && decodedToken.role !== 'admin') {
  //   return NextResponse.redirect(new URL('/dashboard', request.url));
  // }

  if (isAuthPath && session) {
    // Let the login page perform role-aware client redirect.
    // Forcing /dashboard here can break admin/therapist flow.
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/therapist/:path*', '/dashboard/:path*', '/login'],
};
