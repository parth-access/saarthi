import { adminAuth, adminDb } from '../firebase/admin';

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
    // If it's a cookie from session store (if your app uses firebase session cookies)
    // adminAuth.verifySessionCookie(session, true) 
    // BUT typically Next.js Firebase deployments pass the ID token in Authorization header
    // So let's fall back to verifyIdToken if verifySessionCookie fails or we just use verifyIdToken for all.
    // In Firebase, session cookies and ID tokens are different. Let's try verifyIdToken first
    // because that's standard. Wait, the user specifically requested:
    // "adminAuth.verifySessionCookie(session, true)"
    
    // We will assume the __session cookie holds a session cookie.
    let decodedToken;
    try {
       decodedToken = await adminAuth.verifySessionCookie(session, true);
    } catch {
       // fallback in case it's actually an ID token passed
       decodedToken = await adminAuth.verifyIdToken(session, true);
    }
    
    // Fetch user role from database
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
  } catch (error) {
    console.warn("Session verification failed:", error);
    return null;
  }
}
