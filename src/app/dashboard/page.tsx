import DashboardPage from "@/screens/Dashboard";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function DashboardRoute() {
  return (
    <ProtectedRoute>
      <DashboardPage />
    </ProtectedRoute>
  );
}