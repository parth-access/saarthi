import { auth, isFirebaseEnabled, db } from '../lib/firebase/client';
import {
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  User as FirebaseUser,
  signInWithCredential,
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

    try {
      console.log('========== GOOGLE LOGIN OVER IFRAME START ==========');

      const authPromise = new Promise<{ idToken: string; accessToken?: string }>((resolve, reject) => {
        const handleAuthMessage = (event: MessageEvent) => {
          const origin = event.origin;
          if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
            return;
          }

          if (event.data?.type === 'GOOGLE_SIGNIN_SUCCESS') {
            window.removeEventListener('message', handleAuthMessage);
            resolve({
              idToken: event.data.idToken,
              accessToken: event.data.accessToken,
            });
          } else if (event.data?.type === 'GOOGLE_SIGNIN_ERROR') {
            window.removeEventListener('message', handleAuthMessage);
            reject(new Error(event.data.error || 'Google sign-in failed in popup.'));
          }
        };

        window.addEventListener('message', handleAuthMessage);

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
          window.removeEventListener('message', handleAuthMessage);
          reject(new Error('Popup blocked. Please allow popups for this website to sign in with Google.'));
          return;
        }

        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handleAuthMessage);
            // Wait slightly in case the postMessage gets handled just before closure
            setTimeout(() => {
              reject(new Error('Sign-in window was closed before completion.'));
            }, 500);
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

        console.log('✅ Firestore profile created');
      }

      console.log('========== GOOGLE LOGIN OVER IFRAME COMPLETE ==========');
      return user;
    } catch (error: any) {
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