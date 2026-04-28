import { auth, isFirebaseEnabled } from '../lib/firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';

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
  
  getCurrentUser: async () => {
    return new Promise((resolve) => {
      if (!isFirebaseEnabled) return resolve(null);
      const unsubscribe = auth.onAuthStateChanged((user: any) => {
        unsubscribe();
        resolve(user);
      });
    });
  }
};
