import Link from "next/link"
import { House, BookOpen, Tag, Mail, ArrowRight, ArrowLeft } from "lucide-react"

const cardOptions = [
  { href: "/", title: "Home", subtitle: "Back to the main page", Icon: House },
  { href: "/therapists", title: "Therapists", subtitle: "Read about our therapists", Icon: BookOpen },
  { href: "/about", title: "About", subtitle: "Our vision and approach", Icon: Tag },
  { href: "/contact", title: "Contact", subtitle: "Get in touch with us", Icon: Mail },
]

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] antialiased overflow-hidden">
      {/* ---- Top header: logo (top-left) + back link (top-right) ---- */}
      <header className="relative z-20 flex items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="inline-flex items-center gap-3 text-primary"
          aria-label="Saarthi — The Guidance for Life, go to home page"
        >
          <img
            src="/saarthi-logo-Photoroom.png"
            alt="Saarthi Logo"
            className="h-10 w-auto object-contain"
            referrerPolicy="no-referrer"
          />
          <span className="leading-tight">
            <span className="font-serif font-bold text-[#1F5E3B] text-2xl tracking-tight">
              Saarthi
            </span>
            <span className="block text-sm font-normal text-[#3A5A44] tracking-normal mt-0.5">
              The Guidance for Life
            </span>
          </span>
        </Link>

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[#1F5E3B] font-medium transition-colors hover:underline hover:underline-offset-2"
          aria-label="Go back to the home page"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Go home
        </Link>
      </header>

      {/* ---- Center content ---- */}
      <main className="relative flex flex-col items-center justify-center px-6 pb-16 pt-6 text-center">
        {/* Soft organic decoration = large pale-beige blob behind the 404 */}
        <div className="pointer-events-none -z-10 mx-auto mb-10 w-[520px] sm:w-[640px]">
          <div className="mx-auto h-72 w-72 rotate-3 rounded-full bg-[#EFEADF] ring-1 ring-[#EFEADF]/40 shadow-[0_0_60px_10px_rgba(240,235,222,0.55)]" />
        </div>
        {/* Lower-corner soft blobs for the botanical "faint curved line" feel */}
        <div className="pointer-events-none -z-10 absolute -left-14 bottom-0 h-48 w-48 rounded-full bg-[#EFEADF]/80 ring-1 ring-[#EFEADF]/30" />
        <div className="pointer-events-none -z-10 absolute -right-14 bottom-0 h-48 w-48 rounded-full bg-[#EFEADF]/80 ring-1 ring-[#EFEADF]/30" />

        {/* 404 — large serif, overlapping the organic blob */}
        <div className="relative flex w-full max-w-xl items-center justify-center">
          <span
            className="mx-auto inline-block font-serif font-bold leading-none text-7xl sm:text-8xl text-[#1F5E3B] drop-shadow-[0_8px_0_-6px_rgba(31,94,59,0.55)]"
            aria-hidden="true"
          >
            404
          </span>
        </div>

        {/* Heading + subtext */}
        <h1 className="mt-10 text-3xl sm:text-4xl font-serif font-bold text-[#1F5E3B] tracking-tight">
          Page not found
        </h1>
        <p className="mt-4 text-base sm:text-lg leading-relaxed max-w-lg text-[#3A5A44]">
          The page you&apos;re looking for doesn&apos;t seem to exist or may have been moved.
        </p>

        {/* 2x2 navigation cards — each is a clickable card */}
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {cardOptions.map((option) => {
            const { href, title, subtitle, Icon } = option
            return (
              <Link
                key={href}
                href={href}
                className="group relative flex items-center gap-4 rounded-2xl border border-[#D9D2C2] bg-white/90 p-4 shadow-[0_4px_18px_-8px_rgba(31,94,59,0.06)] transition-colors duration-200 hover:border-[#9FB3A3] hover:shadow-[0_10px_28px_-10px_rgba(31,94,59,0.10)]"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#FFF7E6] text-[#1F5E3B] transition-colors group-hover:bg-[#1F5E3B] group-hover:text-white">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="flex flex-1 flex-col">
                  <span className="text-base font-semibold text-[#1F5E3B]">{title}</span>
                  <span className="text-sm text-[#4B5563]">{subtitle}</span>
                </div>
                <ArrowRight
                  className="h-4.5 w-4.5 shrink-0 text-[#7C8F7E] transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[#1F5E3B]"
                  aria-hidden="true"
                />
              </Link>
            )
          })}
        </div>

        {/* Bottom action — green pill "← Go home" */}
        <div className="mt-12">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1F5E3B] px-8 py-3 text-sm font-semibold tracking-wide text-white shadow-[0_6px_18px_-6px_rgba(31,94,59,0.40)] transition-all duration-200 hover:bg-[#174a2e] hover:shadow-[0_10px_24px_-8px_rgba(31,94,59,0.50)] hover:-translate-y-0.5 active:translate-y-0"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go home
          </Link>
        </div>
      </main>
    </div>
  )
}
