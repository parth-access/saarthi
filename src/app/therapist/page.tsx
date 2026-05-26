"use client";

import { AdminPage } from "@/components/admin/AdminPage";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function TherapistRoute() {
  return (
    <ProtectedRoute allowedRoles={['therapist']}>
      <AdminPage />
    </ProtectedRoute>
  );
}
