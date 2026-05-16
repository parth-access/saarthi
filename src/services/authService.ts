import { auth, isFirebaseEnabled, db } from '../lib/firebase/client';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { User } from '../types';

export const authService = {
  login: async (email: string, password: string) => {
    if (!isFirebaseEnabled) throw new Error("Firebase is not enabled.");
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    return userCred.user;
  },
  
  logout: async () => {
    if (isFirebaseEnabled) {
      await signOut(auth);
    }
  },
  
  getUserRole: async (uid: string): Promise<'admin' | 'therapist' | null> => {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.role === 'admin' || data.role === 'therapist') {
          return data.role;
        }
      }
      return null;
    } catch (e) {
      console.error("Error fetching user role:", e);
      return null;
    }
  },

  getCurrentUser: async () => {
    return new Promise((resolve) => {
      if (!isFirebaseEnabled || !auth) return resolve(null);
      const unsubscribe = auth.onAuthStateChanged((user: any) => {
        unsubscribe();
        resolve(user);
      });
    });
  }
};
