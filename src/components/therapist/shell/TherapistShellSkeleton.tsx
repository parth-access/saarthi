import { AdminContentSkeleton } from '@/components/admin/shell/AdminShellSkeleton';

/**
 * The workspace's frame with nothing in it yet, painted while the session
 * resolves, so a therapist sees their workspace arriving rather than a blank
 * page with a spinner. No names, no data: the client gate behind it confirms
 * the live session before anything real is shown.
 */
export function TherapistShellSkeleton() {
  return (
    <div className="admin-dense min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-gradient-to-b from-[#1F5E3B] to-[#153F28] px-4 pt-5 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-serif text-base font-bold text-primary">
            S
          </span>
          <span className="font-serif text-[1.0625rem] font-semibold text-white">Saarthi</span>
        </div>
        <div className="mt-9 space-y-2.5">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-6 rounded-md bg-white/[0.06]" />
          ))}
        </div>
      </aside>
      <div className="lg:pl-64">
        <div className="h-14 border-b border-hairline bg-white/80" />
        <div className="mx-auto w-full max-w-[1400px] px-4 pt-5 sm:px-6 lg:px-8 lg:pt-7">
          <AdminContentSkeleton />
        </div>
      </div>
    </div>
  );
}
