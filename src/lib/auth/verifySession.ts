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
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-dev-secret-do-not-use-in-prod');
      const { payload } = await jwtVerify(session, secret);
      
      return {
        uid: payload.uid as string,
        email: payload.email as string | undefined,
        role: payload.role as string | undefined,
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
