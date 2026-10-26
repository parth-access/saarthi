import { getClientIp } from '../../_lib/rateLimit';
import { checkDistributedRateLimit } from '../../_lib/distributedRateLimit';
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { SignJWT, jwtVerify } from 'jose';
import { verifySession } from '@/lib/auth/verifySession';

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  // Shared across serverless instances (authentication-sensitive path).
  if (!(await checkDistributedRateLimit(clientIp, 'auth_session', 20, 60000)).success) {
    return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
  }

  try {
    const { idToken } = await request.json();
    
    if (!idToken) {
      return NextResponse.json({ error: 'Missing ID token' }, { status: 400 });
    }

    // Verify token to ensure authenticity
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    
    // Fetch user role from database
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    let role = 'client';
    if (userDoc.exists) {
       const userData = userDoc.data();
       role = userData?.role || 'client';

       // Disabled accounts get no session cookie. The console pairs this flag
       // with a sessionRevokeBefore mark (which kills existing cookies); this
       // gate is what stops the person simply signing back in.
       if (userData?.accountDisabled === true) {
         return NextResponse.json(
           { error: 'This account has been disabled. Contact the practice if you believe this is a mistake.' },
           { status: 403 }
         );
       }
    }

    // Create a Custom Edge-Verifiable JWT
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable is missing.');
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
    const secret = new TextEncoder().encode(jwtSecret);
    const alg = 'HS256';
    
    const expiresInSeconds = 60 * 60 * 24 * 5; // 5 days

    const sessionCookie = await new SignJWT({ 
      uid: decodedToken.uid, 
      // Only a verified email may act as booking-ownership proof downstream
      // (cancel-self, join-session, receipts). Unverified → omitted.
      email: decodedToken.email_verified === true ? decodedToken.email : undefined,
      role 
    })
      .setProtectedHeader({ alg })
      // Per-session id, so signing out can revoke exactly this cookie.
      .setJti(crypto.randomUUID())
      .setIssuedAt()
      .setExpirationTime('5d')
      .sign(secret);

    const response = NextResponse.json({ success: true }, { status: 200 });
    
    response.cookies.set('__session', sessionCookie, {
      maxAge: expiresInSeconds,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      // Explicit rather than relying on the framework default: Lax keeps the
      // cookie on top-level navigations while withholding it from cross-site
      // subrequests (CSRF surface stays closed for POSTs).
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Error creating custom session cookie:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Sign-out. Clearing the cookie alone would leave a copied cookie valid until
 * it expires (5 days), so the session's jti is denylisted in
 * `revoked_sessions` until then; verifySession refuses it from now on.
 * Best-effort: the cookie is cleared even if the denylist write fails.
 * (Enable a Firestore TTL policy on `revoked_sessions.expiresAt` to prune it.)
 */
export async function DELETE(request: Request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const token = cookieHeader.match(/__session=([^;]+)/)?.[1];
  const jwtSecret = process.env.JWT_SECRET;
  if (token && jwtSecret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret));
      if (payload.jti && payload.exp) {
        await adminDb.collection('revoked_sessions').doc(payload.jti).set({
          uid: payload.uid ?? null,
          revokedAt: new Date(),
          expiresAt: new Date(payload.exp * 1000),
        });
      }
    } catch (error) {
      console.warn('Could not revoke session on sign-out:', error);
    }
  }

  const response = NextResponse.json({ success: true }, { status: 200 });
  response.cookies.delete('__session');
  return response;
}

/**
 * Fast role lookup for the sign-in gate: who does the existing `__session`
 * cookie belong to, and what is their role right now?
 *
 * verifySession re-reads users/{uid} on the server (Mumbai → Firestore Delhi,
 * a few ms) — much faster than the browser opening its first Firestore
 * connection just to read the role. Honours revocation and disabled accounts
 * exactly like every other API. 401 when there is no valid cookie; the client
 * then falls back to its own Firestore read.
 */
export async function GET(request: Request) {
  const session = await verifySession(request);
  if (!session) {
    return NextResponse.json({ error: 'No session' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
  }
  return NextResponse.json(
    { uid: session.uid, role: session.role },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
