"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Loader2 } from "lucide-react";

export const ProtectedRoute = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Only redirect if loading has completely finished and there is no user
    if (!loading && !currentUser) {
      router.replace("/login");
    }
  }, [currentUser, loading, router]);

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

  return <>{children}</>;
};