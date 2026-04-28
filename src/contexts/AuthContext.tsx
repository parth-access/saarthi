import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User as FirebaseUser, 
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { apiClient } from '../lib/api';

interface AppUser extends FirebaseUser {
  role?: 'admin' | 'user' | 'therapist';
}

interface AuthContextType {
  currentUser: AppUser | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (e: string, p: string) => Promise<void>;
  signupWithEmail: (e: string, p: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      console.warn("Firebase not initialized properly");
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await user.getIdToken();
          const response = await apiClient('/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (response.success && response.data) {
            (user as AppUser).role = response.data.role;
          }
        } catch (error) {
          console.error("Failed to fetch user role", error);
        }
        setCurrentUser(user as AppUser);
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const loginWithGoogle = async () => {
    if (!auth || !googleProvider) throw new Error("Firebase Auth not initialized");
    await signInWithPopup(auth, googleProvider);
  };

  const loginWithEmail = async (e: string, p: string) => {
    if (!auth) throw new Error("Firebase Auth not initialized");
    await signInWithEmailAndPassword(auth, e, p);
  };

  const signupWithEmail = async (e: string, p: string) => {
    if (!auth) throw new Error("Firebase Auth not initialized");
    await createUserWithEmailAndPassword(auth, e, p);
  };

  const logout = async () => {
    if (!auth) return;
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, loginWithGoogle, loginWithEmail, signupWithEmail, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
