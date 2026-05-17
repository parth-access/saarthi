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
    // If logged in and going to /login, just go to abstract dashboard 
    // They will eventually be correctly routed by UI redirect loop
    return NextResponse.redirect(new URL('/dashboard', request.url)); 
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/therapist/:path*', '/dashboard/:path*', '/login'],
};
