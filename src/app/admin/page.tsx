"use client";

import AdminPage from "@/screens/Admin";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function AdminRoute() {
  return (
    <ProtectedRoute>
      <AdminPage />
    </ProtectedRoute>
  );
}
