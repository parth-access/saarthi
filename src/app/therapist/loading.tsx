import { AdminContentSkeleton } from '@/components/admin/shell/AdminShellSkeleton';

/** Between pages the rail stays put; only the content area shows a skeleton. */
export default function TherapistLoading() {
  return <AdminContentSkeleton />;
}
