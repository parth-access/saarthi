import * as React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('admin' | 'therapist' | 'user')[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center space-y-4 bg-background p-4 text-center">
        <h1 className="text-2xl font-bold text-destructive">Unauthorized Access</h1>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
        <button 
          onClick={() => window.history.back()}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        >
          Go Back
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

export function RoleGate({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading || !user || !allowedRoles?.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
