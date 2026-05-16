import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const session = request.cookies.get('__session')?.value;

  const { pathname } = request.nextUrl;

  const isProtectedPath = pathname.startsWith('/admin') || pathname.startsWith('/therapist');
  const isAuthPath = pathname.startsWith('/login');

  if (isProtectedPath && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthPath && session) {
    return NextResponse.redirect(new URL('/admin', request.url)); // Optionally, redirect to the right dashboard based on role
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/therapist/:path*', '/login'],
};
