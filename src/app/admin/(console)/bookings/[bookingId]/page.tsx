import { Suspense } from 'react';
import { BookingDetailScreen } from '@/components/admin/bookings/BookingDetailScreen';

/**
 * One booking.
 *
 * The id comes from the path rather than from a search param, but the screen is a
 * client component that fetches on mount, so it still gets a Suspense boundary:
 * the fallback is what renders while the component's JavaScript is on its way,
 * and a plain sentence there cannot be mistaken for a booking's actual state.
 *
 * Params are a Promise in Next.js 15, so this page is async purely to await them.
 */
export default async function AdminBookingDetailPage({
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
      <BookingDetailScreen bookingId={bookingId} />
    </Suspense>
  );
}
