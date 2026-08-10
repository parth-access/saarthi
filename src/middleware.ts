import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request: NextRequest) {
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

  let decodedRole: string | undefined;

  if (session) {
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error('JWT_SECRET missing');
      }
      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(session, secret);
      decodedRole = payload.role as string | undefined;
    } catch {
      // Invalid session: clear cookie and redirect safely
      if (isAuthPath) {
        const response = NextResponse.next();
        response.cookies.delete('__session');
        return response;
      }
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('__session');
      return response;
    }
  }

  if (isProtectedPath) {
    if (isAdminPath && decodedRole !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    
    if (isTherapistPath && decodedRole !== 'therapist' && decodedRole !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    
    // Dashboard just requires authentication, which we already verified above
  }

  if (isAuthPath && session && decodedRole) {
    // Already authenticated, let client components or page logic redirect appropriately, 
    // or we can redirect to /dashboard here if we want. The prompt mentions:
    // "Let the login page perform role-aware client redirect."
    // "Forcing /dashboard here can break admin/therapist flow."
    // Actually, letting it continue is fine.
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/therapist/:path*', '/dashboard/:path*', '/login'],
};
