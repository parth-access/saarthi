"use client";


import { AdminPage } from "@/components/admin/AdminPage";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function AdminRoute() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminPage />
    </ProtectedRoute>
  );
}
