"use client";


import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Loader2 } from "lucide-react";

export const ProtectedRoute = ({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: Array<"admin" | "therapist" | "client">;
}) => {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Only redirect if loading has completely finished and there is no user
    if (!loading && !currentUser) {
      router.replace("/login");
    } else if (!loading && currentUser && allowedRoles && !allowedRoles.includes(currentUser.role)) {
      // Redirect to correct dashboard based on role
      if (currentUser.role === 'admin') router.replace("/admin");
      else if (currentUser.role === 'therapist') router.replace("/therapist");
      else router.replace("/dashboard");
    }
  }, [currentUser, loading, router, allowedRoles]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBE7]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentUser) {
    // Return loading placeholder while redirecting to avoid flashing unauthenticated content
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBE7]">
        <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBE7]">
        <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  return <>{children}</>;
};