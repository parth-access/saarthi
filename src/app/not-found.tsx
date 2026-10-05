import Link from 'next/link';
import { ArrowLeft, ArrowRight, Compass, Home, Mail, UsersRound } from 'lucide-react';

const destinations = [
  { href: '/', title: 'Home', detail: 'Return to Saarthi', Icon: Home },
  { href: '/therapists', title: 'Find a therapist', detail: 'Meet our practitioners', Icon: UsersRound },
  { href: '/contact', title: 'Contact us', detail: 'We can help you find your way', Icon: Mail },
] as const;

/** A calm, useful recovery page—not a blank expanse with navigation at the fold. */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-primary">
      <header className="border-b border-hairline bg-background/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/saarthi-logo-Photoroom.png" alt="Saarthi" className="h-9 w-auto object-contain" referrerPolicy="no-referrer" />
            <span className="hidden font-serif text-xl font-semibold text-primary sm:inline">Saarthi</span>
          </Link>
          <Link href="/" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary/80 hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center px-4 py-12 sm:px-6 lg:py-16">
        <section className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-warning-surface px-3 py-1 text-xs font-semibold text-warning">
              <Compass className="h-3.5 w-3.5" aria-hidden="true" />
              A different route may help
            </span>
            <p className="mt-6 font-serif text-7xl font-semibold leading-none tracking-tight text-primary sm:text-8xl">404</p>
            <h1 className="mt-5 font-serif text-3xl font-semibold tracking-tight text-primary sm:text-4xl">This page isn’t here.</h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
              The link may be old, or the page may have moved. You can return home or use one of these common paths.
            </p>
            <Link href="/" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Return home
            </Link>
          </div>

          <aside className="rounded-xl border border-hairline bg-white p-3 shadow-sm">
            <p className="px-2 pb-2 pt-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary/50">Where to next</p>
            <div className="space-y-1">
              {destinations.map(({ href, title, detail, Icon }) => (
                <Link key={href} href={href} className="group flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-neutral-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary group-hover:bg-primary group-hover:text-white"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-primary">{title}</span><span className="block truncate text-xs text-muted-foreground">{detail}</span></span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-primary/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
