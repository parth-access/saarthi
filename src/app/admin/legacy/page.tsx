'use client';

/**
 * The console operators use today, kept reachable while the new one is built.
 *
 * This is the pre-existing admin surface — the therapist dashboard with admin
 * panels injected — moved from `/admin` so that route can become the new
 * Overview. It is transitional: it stays until Bookings and Overview can do
 * everything an operator does here, and is deleted at the end of this work.
 * Nothing new should be added to it.
 *
 * Authorization comes from `src/app/admin/layout.tsx`, which gates the whole
 * `/admin` subtree, so no per-page `ProtectedRoute` is needed here.
 */
import { AdminPage } from '@/components/admin/AdminPage';

export default function AdminLegacyPage() {
  return <AdminPage />;
}
