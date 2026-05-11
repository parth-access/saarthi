import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { User as CustomUser } from '../types';
import { auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface AuthContextType {
  currentUser: CustomUser | null;
  loading: boolean;
  login: (email: string, pw: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setLoading(true);
          const role = await authService.getUserRole(firebaseUser.uid);
          if (!role) {
            // Unrecognized role -> hard logout
            await auth.signOut();
            setCurrentUser(null);
          } else {
            setCurrentUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              role: role as 'admin' | 'therapist'
            });
          }
        } else {
          setCurrentUser(null);
        }
      } catch (err) {
        setCurrentUser(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const login = async (email: string, pw: string) => {
    setLoading(true);
    try {
      await authService.login(email, pw);
      // onAuthStateChanged will handle the rest
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const logout = () => {
    authService.logout();
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
