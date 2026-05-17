"use client";

import AdminPage from "@/screens/Admin";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function TherapistRoute() {
  return (
    <ProtectedRoute allowedRoles={['therapist']}>
      <AdminPage />
    </ProtectedRoute>
  );
}
