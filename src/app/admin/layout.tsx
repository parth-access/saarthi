'use client';

/**
 * Authorization boundary for every `/admin` route.
 *
 * Gating here rather than in each page means a new admin route is protected by
 * existing, not by remembering to wrap it. This is the *page* gate: it decides
 * what renders. It is not the security boundary — every admin API re-verifies
 * the session and re-reads the live role server-side on each request, so a
 * revoked admin loses the ability to act even while a stale client still paints
 * the UI.
 *
 * While the session resolves, the console's empty frame is painted instead of
 * a full-screen spinner.
 */
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminShellSkeleton } from '@/components/admin/shell/AdminShellSkeleton';

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['admin']} fallback={<AdminShellSkeleton />}>
      {children}
    </ProtectedRoute>
  );
}
