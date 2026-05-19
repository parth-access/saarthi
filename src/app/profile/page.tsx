"use client";

import Profile from "@/screens/Profile";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function ProfileRoute() {
  return (
    <ProtectedRoute allowedRoles={['client', 'admin']}>
      <Profile />
    </ProtectedRoute>
  );
}
