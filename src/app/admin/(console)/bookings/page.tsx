import { Suspense } from 'react';
import { BookingsScreen } from '@/components/admin/bookings/BookingsScreen';

/**
 * The bookings list.
 *
 * `BookingsScreen` reads the filters from the URL with `useSearchParams`, which
 * Next.js requires be inside a Suspense boundary — without one the whole route
 * opts out of static rendering and the build warns. The fallback is a plain
 * message rather than a fake table, so nothing on screen can be mistaken for
 * data before any query has run.
 */
export default function AdminBookingsPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-hairline bg-white px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
          Loading the bookings list…
        </div>
      }
    >
      <BookingsScreen />
    </Suspense>
  );
}
