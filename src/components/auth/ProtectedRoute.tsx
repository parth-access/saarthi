"use client";


import { usePathname, useRouter } from "next/navigation";
import React, { useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { getLoginRedirectPath } from "@/lib/auth/returnPath";

export const ProtectedRoute = ({
  children,
  allowedRoles,
  fallback,
}: {
  children: React.ReactNode;
  allowedRoles?: Array<"admin" | "therapist" | "client">;
  /**
   * Painted while the session resolves or a redirect is pending, in place of
   * the full-screen spinner — e.g. a skeleton of the page's own frame, so the
   * wait looks like the page arriving rather than a blank screen.
   */
  fallback?: React.ReactNode;
}) => {
  const { currentUser, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const currentRole = currentUser?.role;
  const isAuthenticated = currentUser !== null;
  const isRoleAllowed = !allowedRoles || (
    currentRole !== undefined && allowedRoles.includes(currentRole)
  );
  const roleRedirect = !isRoleAllowed && currentRole
      ? currentRole === "admin"
        ? "/admin"
        : currentRole === "therapist"
          ? "/therapist"
          : "/dashboard"
      : null;

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      // This guard runs only in the browser. Reading the URL here avoids a
      // useSearchParams CSR bailout in statically rendered protected layouts.
      router.replace(getLoginRedirectPath(pathname, window.location.search));
    } else if (roleRedirect) {
      router.replace(roleRedirect);
    }
  }, [loading, isAuthenticated, pathname, roleRedirect, router]);

  if (fallback !== undefined && (loading || !isAuthenticated || !isRoleAllowed)) {
    return <>{fallback}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBE7]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Return loading placeholder while redirecting to avoid flashing unauthenticated content
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBE7]">
        <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  if (!isRoleAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBE7]">
        <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  return <>{children}</>;
};
