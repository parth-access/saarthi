import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const session = request.cookies.get('__session')?.value;

  const { pathname } = request.nextUrl;

  const isProtectedPath = pathname.startsWith('/admin') || pathname.startsWith('/therapist') || pathname.startsWith('/dashboard');
  const isAuthPath = pathname.startsWith('/login');

  if (isProtectedPath && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

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
