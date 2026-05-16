"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { authService } from '../services/authService';
import { User as CustomUser } from '../types';
import { auth } from '../lib/firebase/client';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  currentUser: CustomUser | null;
  loading: boolean;
  login: (email: string, pw: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    if (!auth) {
      setLoading(false);
      return;
    }
    
    // onAuthStateChanged automatically fires immediately with current state
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // If already loading, we just keep it loading until we have the role
          setLoading(true);
          const role = await authService.getUserRole(firebaseUser.uid);
          
          if (!isMounted.current) return;
          
          if (!role) {
            // Unrecognized role -> hard logout
            await auth.signOut();
            await fetch('/api/auth/session', { method: 'DELETE' });
            if (isMounted.current) {
              setCurrentUser(null);
              setLoading(false);
            }
          } else {
            // Sync session cookie
            const idToken = await firebaseUser.getIdToken();
            await fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken }),
            });

            if (isMounted.current) {
              setCurrentUser({
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                role: role as 'admin' | 'therapist'
              });
              setLoading(false);
              router.refresh();
            }
          }
        } else {
          await fetch('/api/auth/session', { method: 'DELETE' });
          if (isMounted.current) {
            setCurrentUser(null);
            setLoading(false);
          }
        }
      } catch (err) {
        await fetch('/api/auth/session', { method: 'DELETE' });
        if (isMounted.current) {
          setCurrentUser(null);
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [router]);

  const login = async (email: string, pw: string) => {
    setLoading(true);
    try {
      await authService.login(email, pw);
      // onAuthStateChanged will detect the new user, fetch role, update currentUser, and setLoading(false)
    } catch (error) {
      if (isMounted.current) setLoading(false);
      throw error;
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await authService.logout();
      await fetch('/api/auth/session', { method: 'DELETE' });
      if (isMounted.current) {
        setCurrentUser(null);
        setLoading(false);
        router.refresh();
      }
    } catch (error) {
      if (isMounted.current) setLoading(false);
      console.error('Logout error', error);
    }
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
