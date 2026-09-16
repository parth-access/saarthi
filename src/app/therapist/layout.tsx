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
import { useTherapistDashboard, type TherapistDashboardData } from '@/hooks/useTherapistDashboard';
import { createContext, useContext } from 'react';

// Context to share dashboard data across therapist pages without re-fetching
const TherapistDataContext = createContext<TherapistDashboardData | null>(null);

export function useTherapistData(): TherapistDashboardData {
  const ctx = useContext(TherapistDataContext);
  if (!ctx) throw new Error('useTherapistData must be used inside TherapistLayout');
  return ctx;
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
        {children}
      </TherapistShell>
    </TherapistDataContext.Provider>
  );
}

export default function TherapistLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['therapist']}>
      <TherapistLayoutInner>{children}</TherapistLayoutInner>
    </ProtectedRoute>
  );
}
