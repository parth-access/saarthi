import { Suspense } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { TherapistBookingDetailScreen } from '@/components/therapist/TherapistBookingDetailScreen';

/**
 * One booking, as the assigned therapist sees it.
 *
 * Mirrors the admin console's detail page: the id comes from the path, the
 * screen is a client component that fetches on mount, and the Suspense fallback
 * is what renders while that JavaScript is on its way.
 *
 * Access is enforced in three layers: middleware requires an authenticated
 * session cookie for /therapist, ProtectedRoute requires the therapist role in
 * the client, and the API re-verifies the session plus booking ownership
 * server-side on every fetch. Clients and unauthenticated visitors are handled
 * by those same layers (client role is redirected away by ProtectedRoute).
 */
export default async function TherapistBookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="rounded-xl border border-hairline bg-white px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
            Loading this booking…
          </div>
        </div>
      }
    >
      <ProtectedRoute allowedRoles={['therapist']}>
        <TherapistBookingDetailScreen bookingId={bookingId} />
      </ProtectedRoute>
    </Suspense>
  );
}
