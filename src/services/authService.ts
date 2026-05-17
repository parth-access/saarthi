import { auth, isFirebaseEnabled, db } from '../lib/firebase/client';
import { signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { User } from '../types';

export const authService = {
  register: async (email: string, password: string, name: string) => {
    if (!isFirebaseEnabled) throw new Error("Firebase is not enabled.");
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
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
      lastSessionDate: null
    });
    
    return user;
  },

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
  
  getUserRole: async (uid: string): Promise<'admin' | 'therapist' | 'client' | null> => {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.role === 'admin' || data.role === 'therapist' || data.role === 'client') {
          return data.role;
        }
      } else {
        // If they authenticated but don't have a user doc, we could create them as a client
        // But better to enforce create during register.
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
