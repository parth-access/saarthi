import { auth, isFirebaseEnabled, db } from '../lib/firebase/client';
import {
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  User as FirebaseUser,
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

    const provider = new GoogleAuthProvider();

    provider.setCustomParameters({
      prompt: 'select_account',
    });

    try {
      console.log('========== GOOGLE LOGIN START ==========');

      const userCred = await signInWithPopup(auth, provider);

      console.log('✅ signInWithPopup SUCCESS');
      console.log(userCred);

      const user = userCred.user;

      console.log('UID:', user.uid);
      console.log('Email:', user.email);
      console.log('Display Name:', user.displayName);

      console.log('Getting ID Token...');
      const token = await user.getIdToken();
      console.log('✅ ID Token received');
      console.log(token.substring(0, 40) + '...');

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

      console.log('========== GOOGLE LOGIN COMPLETE ==========');

      return user;
    } catch (error: any) {
      console.error('========== GOOGLE LOGIN FAILED ==========');
      console.error('Code:', error?.code);
      console.error('Message:', error?.message);
      console.error('CustomData:', error?.customData);
      console.error('Credential:', error?.credential);
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