import { auth, isFirebaseEnabled, db } from '../lib/firebase/client';
import {
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  User as FirebaseUser,
  signInWithCredential,
  signInWithPopup,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

export const authService = {
  loginWithGoogle: async () => {
    if (!isFirebaseEnabled) {
      throw new Error('Firebase is not enabled.');
    }

    // 1. Check if we are running outside of an iframe (direct domain, e.g. www.saarthilife.com)
    // If we are not in an iframe, we use the standard, fully supported, native signInWithPopup.
    const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;

    if (!isEmbedded) {
      console.log('========== GOOGLE LOGIN NATIVE START (OUTSIDE IFRAME) ==========');
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({
          prompt: 'select_account',
        });
        const userCred = await signInWithPopup(auth, provider);
        const user = userCred.user;

        console.log('UID:', user.uid);
        console.log('Email:', user.email);

        const userDocRef = doc(db, 'users', user.uid);
        console.log('Checking Firestore user...');
        const userDoc = await getDoc(userDocRef);

        console.log('User exists:', userDoc.exists());

        if (!userDoc.exists()) {
          console.log('Creating Firestore profile...');
          console.log('Current Auth User State:', auth.currentUser);
          console.log('Current Auth UID:', auth.currentUser?.uid);

          try {
            console.log('Writing Firestore document...');
            await setDoc(userDocRef, {
              uid: user.uid,
              name: user.displayName || 'User',
              email: user.email,
              role: 'client',
              provider: 'google',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              totalSessions: 0,
              activeBookings: 0,
              preferredTherapists: [],
              lastSessionDate: null,
            });
            console.log('✅ Firestore profile created successfully!');
          } catch (writeError) {
            console.error('❌ Firestore profile creation failed:', writeError);
            throw writeError;
          }
        }

        console.log('========== GOOGLE LOGIN NATIVE COMPLETE ==========');
        return user;
      } catch (error: unknown) {
        console.error('========== GOOGLE LOGIN NATIVE FAILED ==========');
        console.error('Full Error:', error);
        throw error;
      }
    }

    // 2. We are in an iframe (e.g. AI Studio preview). Use the multi-channel popup redirect bridge.
    try {
      console.log('========== GOOGLE LOGIN OVER IFRAME START ==========');

      const authPromise = new Promise<{ idToken: string; accessToken?: string }>((resolve, reject) => {
        let checkClosed: NodeJS.Timeout | null = null;
        let bc: BroadcastChannel | null = null;

        const cleanup = () => {
          if (checkClosed) {
            clearInterval(checkClosed);
          }
          window.removeEventListener('message', handleAuthMessage);
          window.removeEventListener('storage', handleStorageEvent);
          if (bc) {
            try {
              bc.close();
            } catch {
              // Ignore
            }
          }
          try {
            localStorage.removeItem('saarthi_auth_success');
            localStorage.removeItem('saarthi_auth_error');
          } catch {
            // Ignore
          }
        };

        const handleSuccess = (idToken: string, accessToken?: string) => {
          cleanup();
          resolve({ idToken, accessToken });
        };

        const handleError = (errorMsg: string) => {
          cleanup();
          reject(new Error(errorMsg));
        };

        const handleAuthMessage = (event: MessageEvent) => {
          const origin = event.origin;
          const isSameOrigin = origin === window.location.origin;
          const isAllowedDomain = origin.endsWith('.run.app') || origin.includes('localhost') || origin.endsWith('saarthilife.com');
          
          if (!isSameOrigin && !isAllowedDomain) {
            return;
          }

          if (event.data?.type === 'GOOGLE_SIGNIN_SUCCESS') {
            console.log('Received GOOGLE_SIGNIN_SUCCESS via postMessage');
            handleSuccess(event.data.idToken, event.data.accessToken);
          } else if (event.data?.type === 'GOOGLE_SIGNIN_ERROR') {
            console.log('Received GOOGLE_SIGNIN_ERROR via postMessage');
            handleError(event.data.error || 'Google sign-in failed in popup.');
          }
        };

        const handleStorageEvent = (event: StorageEvent) => {
          if (event.key === 'saarthi_auth_success' && event.newValue) {
            try {
              const data = JSON.parse(event.newValue);
              console.log('Received saarthi_auth_success via localStorage');
              handleSuccess(data.idToken, data.accessToken);
            } catch {
              // Ignore
            }
          } else if (event.key === 'saarthi_auth_error' && event.newValue) {
            try {
              const data = JSON.parse(event.newValue);
              console.log('Received saarthi_auth_error via localStorage');
              handleError(data.error || 'Google sign-in failed.');
            } catch {
              // Ignore
            }
          }
        };

        // A. Listen via postMessage
        window.addEventListener('message', handleAuthMessage);

        // B. Listen via storage event (works even if window.opener is null)
        window.addEventListener('storage', handleStorageEvent);

        // C. Listen via BroadcastChannel (works even if window.opener is null)
        try {
          bc = new BroadcastChannel('saarthi_auth');
          bc.onmessage = (event) => {
            if (event.data?.type === 'GOOGLE_SIGNIN_SUCCESS') {
              console.log('Received GOOGLE_SIGNIN_SUCCESS via BroadcastChannel');
              handleSuccess(event.data.idToken, event.data.accessToken);
            } else if (event.data?.type === 'GOOGLE_SIGNIN_ERROR') {
              console.log('Received GOOGLE_SIGNIN_ERROR via BroadcastChannel');
              handleError(event.data.error || 'Google sign-in failed.');
            }
          };
        } catch (e) {
          console.error('BroadcastChannel initialization failed or not supported:', e);
        }

        const width = 500;
        const height = 650;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        const popup = window.open(
          '/auth-popup',
          'saarthi_google_signin',
          `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
        );

        if (!popup) {
          cleanup();
          reject(new Error('Popup blocked. Please allow popups for this website to sign in with Google.'));
          return;
        }

        checkClosed = setInterval(() => {
          if (popup.closed) {
            // Wait slightly in case the message was posted just before closing
            setTimeout(() => {
              handleError('Sign-in window was closed before completion.');
            }, 800);
          }
        }, 1000);
      });

      const { idToken, accessToken } = await authPromise;

      console.log('✅ Received tokens from popup, signing in within iframe...');
      const credential = GoogleAuthProvider.credential(idToken, accessToken);
      const userCred = await signInWithCredential(auth, credential);
      const user = userCred.user;

      console.log('UID:', user.uid);
      console.log('Email:', user.email);

      const userDocRef = doc(db, 'users', user.uid);
      console.log('Checking Firestore user...');
      const userDoc = await getDoc(userDocRef);

      console.log('User exists:', userDoc.exists());

      if (!userDoc.exists()) {
        console.log('Creating Firestore profile...');
        console.log('Current Auth User State:', auth.currentUser);
        console.log('Current Auth UID:', auth.currentUser?.uid);

        try {
          console.log('Writing Firestore document...');
          await setDoc(userDocRef, {
            uid: user.uid,
            name: user.displayName || 'User',
            email: user.email,
            role: 'client',
            provider: 'google',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            totalSessions: 0,
            activeBookings: 0,
            preferredTherapists: [],
            lastSessionDate: null,
          });
          console.log('✅ Firestore profile created successfully!');
        } catch (writeError) {
          console.error('❌ Firestore profile creation failed:', writeError);
          throw writeError;
        }
      }

      console.log('========== GOOGLE LOGIN OVER IFRAME COMPLETE ==========');
      return user;
    } catch (error: unknown) {
      console.error('========== GOOGLE LOGIN OVER IFRAME FAILED ==========');
      console.error('Full Error:', error);
      throw error;
    }
  },

  register: async (email: string, password: string, name: string) => {
    if (!isFirebaseEnabled) throw new Error('Firebase is not enabled.');

    const userCred = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    const user = userCred.user;

    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      name,
      email,
      role: 'client',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      totalSessions: 0,
      activeBookings: 0,
      preferredTherapists: [],
      lastSessionDate: null,
    });

    return user;
  },

  login: async (email: string, password: string) => {
    if (!isFirebaseEnabled) throw new Error('Firebase is not enabled.');

    const userCred = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    return userCred.user;
  },

  logout: async () => {
    if (isFirebaseEnabled) {
      await signOut(auth);
    }
  },

  getUserRole: async (
    uid: string
  ): Promise<'admin' | 'therapist' | 'client' | null> => {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));

      if (userDoc.exists()) {
        const data = userDoc.data();

        if (
          data.role === 'admin' ||
          data.role === 'therapist' ||
          data.role === 'client'
        ) {
          return data.role;
        }
      }

      return null;
    } catch (e) {
      console.error('Error fetching user role:', e);
      return null;
    }
  },

  getCurrentUser: async () => {
    return new Promise((resolve) => {
      if (!isFirebaseEnabled || !auth) return resolve(null);

      const unsubscribe = auth.onAuthStateChanged(
        (user: FirebaseUser | null) => {
          unsubscribe();
          resolve(user);
        }
      );
    });
  },
};