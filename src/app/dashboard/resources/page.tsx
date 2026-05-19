"use client";

import Resources from "@/screens/Resources";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function ResourcesRoute() {
  return (
    <ProtectedRoute allowedRoles={['client', 'admin', 'therapist']}>
      <Resources />
    </ProtectedRoute>
  );
}
