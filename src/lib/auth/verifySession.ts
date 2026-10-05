import { adminAuth, adminDb } from '../firebase/admin';
import { jwtVerify } from 'jose';

export interface DecodedSessionInfo {
  uid: string;
  email?: string;
  role?: string;
}

export async function verifySession(request: Request): Promise<DecodedSessionInfo | null> {
  let session = '';
  
  // Try to get Authorization header first
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    session = authHeader.split('Bearer ')[1];
  } else {
    // Fallback to cookie
    const cookieHeader = request.headers.get('cookie') || '';
    const match = cookieHeader.match(/__session=([^;]+)/);
    if (match) {
      session = match[1];
    }
  }

  if (!session) return null;

  try {
    // First, try verifying it as our custom Edge-Verifiable JWT
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error('JWT_SECRET missing');
      }
      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(session, secret);
      
      const uid = payload.uid as string;
      const email = payload.email as string | undefined;

      // Fetch live user role from database to ensure immediate role revocation
      const userDoc = await adminDb.collection('users').doc(uid).get();
      let role = 'client';
      if (userDoc.exists) {
        const userData = userDoc.data();
        role = userData?.role || 'client';
      }

      return {
        uid,
        email,
        role,
      };
    } catch {
       // If it fails, it might be a raw Firebase ID token passed in the Authorization header.
       const decodedToken = await adminAuth.verifyIdToken(session, true);
       
       // Need to fetch role again for raw ID tokens
       const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
       let role = 'client';
       if (userDoc.exists) {
          const userData = userDoc.data();
          role = userData?.role || 'client';
       }

       return {
         uid: decodedToken.uid,
         email: decodedToken.email,
         role
       };
    }
  } catch (error) {
    console.warn("Session verification failed:", error);
    return null;
  }
}
