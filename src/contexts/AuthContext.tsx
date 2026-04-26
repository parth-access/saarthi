import * as React from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User as FirebaseUser,
  getIdToken
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseEnabled } from '../lib/firebase';
import { toast } from 'sonner';

interface User {
  id: string;
  email: string | null;
  name: string | null;
  role: 'admin' | 'therapist' | 'user';
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Helper to fetch fresh ID token
  const getFreshToken = async () => {
    if (!auth?.currentUser) return null;
    return await getIdToken(auth.currentUser, true); // Force refresh
  };

  const syncUser = async (firebaseUser: FirebaseUser) => {
    try {
      const idToken = await getIdToken(firebaseUser);
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      const result = await response.json();
      if (result.success) {
        const userData = result.data.user;
        setUser(userData);
        localStorage.setItem('saarthi_user', JSON.stringify(userData));
        localStorage.setItem('saarthi_token', idToken);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to sync user:', error);
      toast.error('Session expired or invalid.');
      logout();
    }
  };

  const validateSession = async () => {
    if (!auth?.currentUser) {
      const saved = localStorage.getItem('saarthi_user');
      if (saved) {
        // We had a saved session but no firebase user yet? 
        // Wait for onAuthStateChanged to handle it or clear if it doesn't happen
      }
      return;
    }

    try {
      const token = await getFreshToken();
      if (!token) return;

      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const result = await response.json();
      if (result.success) {
        const userData = result.data;
        setUser(userData);
        localStorage.setItem('saarthi_user', JSON.stringify(userData));
      } else if (response.status === 401 || response.status === 404) {
        // Backend says no, or user deleted
        logout();
      }
    } catch (error) {
      console.error('Session validation failed:', error);
    }
  };

  React.useEffect(() => {
    if (!isFirebaseEnabled || !auth) {
      setIsLoading(false);
      return;
    }

    let isSubscribed = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isSubscribed) return;
      
      setIsLoading(true);
      try {
        if (firebaseUser) {
          // High-security: always sync with backend on auth state change
          await syncUser(firebaseUser);
        } else {
          setUser(null);
          localStorage.removeItem('saarthi_user');
          localStorage.removeItem('saarthi_token');
        }
      } finally {
        if (isSubscribed) setIsLoading(false);
      }
    }, (error) => {
      console.error('Auth state change error:', error);
      setIsLoading(false);
    });

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, []);

  const login = async () => {
    if (!isFirebaseEnabled || !auth) {
      toast.error('Authentication is currently unavailable.');
      return;
    }
    try {
      setIsLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      await syncUser(result.user);
      toast.success('Successfully logged in!');
    } catch (error) {
      console.error('Login failed:', error);
      toast.error('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    if (!isFirebaseEnabled || !auth) {
      setUser(null);
      return;
    }
    try {
      setIsLoading(true);
      await signOut(auth);
      setUser(null);
      localStorage.removeItem('saarthi_user');
      localStorage.removeItem('saarthi_token');
      toast.success('Logged out successfully.');
    } catch (error) {
      console.error('Logout failed:', error);
      toast.error('Logout failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    if (isFirebaseEnabled && auth && auth.currentUser) {
      await validateSession();
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
