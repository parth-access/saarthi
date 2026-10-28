/**
 * The console's frame with nothing in it yet: painted while the session
 * resolves, so the first thing an operator sees is the console arriving rather
 * than a blank page with a spinner.
 *
 * It renders no section names and no data. The middleware has already checked
 * the role cookie before this page was served; the client gate behind this
 * skeleton confirms the live session before anything real is shown.
 */
export function AdminContentSkeleton({ withHeader = false }: { withHeader?: boolean }) {
  return (
    <div aria-busy="true" className="animate-pulse">
      <p className="sr-only">Loading…</p>
      {withHeader && (
        <div className="mb-6">
          <div className="h-7 w-48 rounded-md bg-primary/10" />
          <div className="mt-2 h-4 w-80 max-w-full rounded bg-primary/[0.06]" />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 rounded-xl border border-hairline bg-white" />
        ))}
      </div>
      <div className="mt-3 h-72 rounded-xl border border-hairline bg-white" />
    </div>
  );
}

export function AdminShellSkeleton() {
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
          {Array.from({ length: 9 }, (_, index) => (
            <div key={index} className="h-6 rounded-md bg-white/[0.06]" />
          ))}
        </div>
      </aside>
      <div className="lg:pl-64">
        <div className="h-14 border-b border-hairline bg-white/80" />
        <div className="mx-auto w-full max-w-[1400px] px-4 pt-5 sm:px-6 lg:px-8 lg:pt-7">
          <AdminContentSkeleton withHeader />
        </div>
      </div>
    </div>
  );
}
