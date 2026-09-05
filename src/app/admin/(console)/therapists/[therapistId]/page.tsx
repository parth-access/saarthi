import { Suspense } from 'react';
import { TherapistDetailScreen } from '@/components/admin/therapists/TherapistDetailScreen';

/**
 * One therapist and their schedule.
 *
 * Params are a Promise in Next.js 15, so this page is async purely to await them.
 * The screen fetches on mount, so the Suspense fallback covers the wait for its
 * JavaScript — a sentence, never a shape that could be mistaken for real hours.
 */
export default async function AdminTherapistDetailPage({
  params,
}: {
  params: Promise<{ therapistId: string }>;
}) {
  const { therapistId } = await params;

  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-hairline bg-white px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
          Loading this therapist…
        </div>
      }
    >
      <TherapistDetailScreen therapistId={therapistId} />
    </Suspense>
  );
}
