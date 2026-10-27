import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getLoginRedirectPath } from './lib/auth/returnPath';
import { isBetterAuth } from './lib/auth/provider';

/**
 * Page gate only: every API route re-checks the session and live role itself.
 * With AUTH_PROVIDER=better-auth the role comes from Better Auth's session
 * (its signed cookie cache, refreshed from Postgres at most every 5 minutes);
 * otherwise from the Firebase-era `__session` JWT.
 */
async function betterAuthRole(request: NextRequest): Promise<string | null | undefined> {
  try {
    const { auth } = await import('./lib/auth/betterAuth');
    const result = await auth.api.getSession({ headers: request.headers });
    if (!result || result.user.banned) return null;
    return result.user.role || 'client';
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isBetterAuth()) {
    return betterAuthGate(request, pathname, search);
  }

  const session = request.cookies.get('__session')?.value;

  const isAdminPath = pathname.startsWith('/admin');
  const isTherapistPath = pathname.startsWith('/therapist');
  const isDashboardPath = pathname.startsWith('/dashboard');
  const isProtectedPath = isAdminPath || isTherapistPath || isDashboardPath;
  const isAuthPath = pathname.startsWith('/login');

  if (isProtectedPath && !session) {
    return NextResponse.redirect(
      new URL(getLoginRedirectPath(pathname, search), request.url)
    );
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
      const loginPath = isProtectedPath
        ? getLoginRedirectPath(pathname, search)
        : '/login';
      const response = NextResponse.redirect(new URL(loginPath, request.url));
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

async function betterAuthGate(request: NextRequest, pathname: string, search: string) {
  const isAdminPath = pathname.startsWith('/admin');
  const isTherapistPath = pathname.startsWith('/therapist');
  const isProtectedPath = isAdminPath || isTherapistPath || pathname.startsWith('/dashboard');
  if (!isProtectedPath) return NextResponse.next();

  const role = await betterAuthRole(request);
  if (!role) {
    return NextResponse.redirect(new URL(getLoginRedirectPath(pathname, search), request.url));
  }
  if (isAdminPath && role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  if (isTherapistPath && role !== 'therapist' && role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Node runtime: the Better Auth path may read Postgres on a cookie-cache miss.
  runtime: 'nodejs',
  matcher: ['/admin/:path*', '/therapist/:path*', '/dashboard/:path*', '/login'],
};
