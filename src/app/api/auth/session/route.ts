import { getClientIp } from '../../_lib/rateLimit';
import { checkDistributedRateLimit } from '../../_lib/distributedRateLimit';
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { SignJWT } from 'jose';

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
      email: decodedToken.email,
      role 
    })
      .setProtectedHeader({ alg })
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

export async function DELETE() {
  const response = NextResponse.json({ success: true }, { status: 200 });
  response.cookies.delete('__session');
  return response;
}
