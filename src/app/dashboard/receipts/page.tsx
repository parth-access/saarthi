"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import DashboardReceiptsPage from "@/screens/DashboardReceipts";

export default function DashboardReceiptsRoute() {
  return (
    <ProtectedRoute>
      <DashboardReceiptsPage />
    </ProtectedRoute>
  );
}