import { Suspense } from 'react';
import { TherapistBookingDetailScreen } from '@/components/therapist/TherapistBookingDetailScreen';

/**
 * One booking, as the assigned therapist sees it.
 *
 * Now rendered inside the TherapistShell layout, so the sidebar stays
 * persistent while viewing a booking. Auth is handled by the layout's
 * ProtectedRoute; the API re-verifies ownership server-side on every fetch.
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
        <div className="rounded-xl border border-hairline bg-white px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
          Loading this booking…
        </div>
      }
    >
      <TherapistBookingDetailScreen bookingId={bookingId} />
    </Suspense>
  );
}
