import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-24 text-center">
      <Link href="/" className="flex items-center gap-3 text-primary mb-10">
        <img
          src="/saarthi-logo-Photoroom.png"
          alt="Saarthi Logo"
          className="h-10 w-auto object-contain"
          referrerPolicy="no-referrer"
        />
        <span className="font-heading text-2xl font-bold tracking-tight text-text">
          Saarthi
        </span>
      </Link>

      <p className="text-accent font-medium tracking-[0.3em] uppercase text-xs mb-6">
        404
      </p>
      <h1 className="text-4xl md:text-6xl font-serif font-bold text-primary mb-6">
        Page Not Found
      </h1>
      <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-xl mb-12">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
        Let&apos;s walk you back to a calmer place.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm px-10 h-12 text-base font-medium transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:-translate-y-0.5"
        >
          Back to Home
        </Link>
        <Link
          href="/therapists"
          className="inline-flex items-center justify-center rounded-full border border-primary/20 bg-transparent text-primary shadow-sm px-10 h-12 text-base font-medium transition-all duration-200 hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5"
        >
          Meet Our Therapists
        </Link>
      </div>
    </div>
  );
}
