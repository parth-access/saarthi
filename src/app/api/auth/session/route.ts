import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { SignJWT } from 'jose';

export async function POST(request: Request) {
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
    }

    // Create a Custom Edge-Verifiable JWT
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-dev-secret-do-not-use-in-prod');
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
