'use client';

/**
 * Therapist workspace layout.
 *
 * This is the Next.js layout for all /therapist routes. It renders the
 * persistent shell (sidebar, top bar) and fetches the therapist's data once,
 * so tab changes never re-fetch. Structurally mirrors the admin console's
 * layout at /admin/(console)/layout.tsx.
 *
 * Authorization: middleware requires an authenticated session cookie for
 * /therapist, ProtectedRoute requires the therapist role in the client,
 * and every API re-verifies server-side.
 */
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { TherapistShell } from '@/components/therapist/shell/TherapistShell';
import { TherapistShellSkeleton } from '@/components/therapist/shell/TherapistShellSkeleton';
import { useTherapistDashboard, type TherapistDashboardData } from '@/hooks/useTherapistDashboard';
import { TherapistDataContext } from '@/components/therapist/TherapistDataContext';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AdminContentSkeleton } from '@/components/admin/shell/AdminShellSkeleton';
import { Button } from '@/components/ui/Button';

/**
 * What every page shows before it has a workspace to show: a skeleton during
 * the first read, and a way to try again when that read failed or found no
 * profile. Pages below can then trust `therapist` and `bookings` — an empty
 * client list means no clients, never "not loaded yet".
 */
function WorkspaceGate({ data, children }: { data: TherapistDashboardData; children: React.ReactNode }) {
  if (data.initialLoading) return <AdminContentSkeleton />;
  if (!data.therapist) {
    return (
      <div className="mx-auto max-w-md pt-10 text-center">
        <div role="alert" className="rounded-xl border border-hairline bg-white p-8 shadow-sm">
          <AlertTriangle className="mx-auto h-6 w-6 text-warning" aria-hidden="true" />
          <h2 className="mt-3 font-serif text-lg font-semibold text-primary">Couldn&apos;t load your workspace</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.error ?? 'No therapist profile is linked to this account yet. Ask the practice to link it.'}
          </p>
          <Button variant="outline" size="sm" onClick={data.refresh} disabled={data.loading} className="mt-4">
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${data.loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Try again
          </Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function TherapistLayoutInner({ children }: { children: React.ReactNode }) {
  const data = useTherapistDashboard();

  return (
    <TherapistDataContext.Provider value={data}>
      <TherapistShell
        therapist={data.therapist}
        onRefresh={data.refresh}
        loading={data.loading}
      >
        <WorkspaceGate data={data}>{children}</WorkspaceGate>
      </TherapistShell>
    </TherapistDataContext.Provider>
  );
}

export default function TherapistLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['therapist']} fallback={<TherapistShellSkeleton />}>
      <TherapistLayoutInner>{children}</TherapistLayoutInner>
    </ProtectedRoute>
  );
}
