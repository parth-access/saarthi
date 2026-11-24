"use client";


import Image from "next/image";
import * as React from "react"
import { Button } from "../ui/Button"
import MobileMenu from "./MobileMenu"
import Link from "next/link"
import { GraduationCap } from "lucide-react"
import { SAARTHI_CLASSES_URL } from "@/constants/links"
import { useAuth } from "../../contexts/AuthContext"
import { trackEvent } from "@/lib/analytics"

interface NavbarProps {
  onBookClick?: () => void;
}

const Navbar = ({ onBookClick }: NavbarProps) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)
  const { currentUser } = useAuth()

  // Quiet at the top of the page; a soft frosted bar with a hairline once the visitor scrolls.
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const handleBookClick = () => {
    trackEvent('book_demo_click', {
      location: 'navbar',
      cta_text: 'Book Session'
    });
    if (onBookClick) onBookClick();
  };

  const navLinks = [
    { name: "Therapists", href: "/therapists" },
    { name: "About", href: "/about" },
    { name: "Our Vision", href: "/vision" },
    { name: "Contact", href: "/contact" },
  ]
  
  // The client wellness page explicitly excludes the therapist role.
  if (currentUser && currentUser.role !== 'therapist') {
    navLinks.push({ name: "Resources", href: "/dashboard/resources" })
  }

  let portalLink = "/login";
  let portalText = "Sign In";
  if (currentUser) {
    if (currentUser.role === 'admin') {
      portalLink = "/admin";
      portalText = "Admin Portal";
    } else if (currentUser.role === 'therapist') {
      portalLink = "/therapist";
      portalText = "Therapist Portal";
    } else {
      portalLink = "/dashboard";
      portalText = "My Dashboard";
    }
  }

  return (
    <nav className={`fixed top-0 z-50 w-full border-b transition-[background-color,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${scrolled ? "border-muted bg-background/85 shadow-[0_10px_30px_-24px_rgba(19,59,41,0.45)] backdrop-blur-md" : "border-transparent bg-background/60 backdrop-blur-sm"}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className={`flex items-center justify-between transition-[height] duration-300 ${scrolled ? "h-16" : "h-[4.5rem]"}`}>
          
          {/* Left: Logo */}
          <div className="flex items-center">
            <Link href="/"
              className="group flex items-center gap-2.5 rounded-lg text-primary-ink font-serif"
            >
              <Image
                src="/saarthi-logo.webp"
                alt="Saarthi"
                width={256}
                height={256}
                priority
                className="h-10 md:h-11 w-auto object-contain"
              />

              <span className="hidden md:inline text-[1.6rem] font-medium tracking-tight">
                Saarthi
              </span>
            </Link>
          </div>

          {/* Center: Desktop Links */}
          <div className="hidden md:flex flex-1 justify-center">
            <div className="flex items-center gap-6 lg:gap-9">
              {navLinks.map((link) => (
                <Link key={link.name}
                  href={link.href}
                  className="relative whitespace-nowrap text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-primary after:absolute after:-bottom-1.5 after:left-0 after:h-[1.5px] after:w-full after:origin-center after:scale-x-0 after:rounded-full after:bg-accent/70 after:transition-transform after:duration-300 after:ease-out hover:after:scale-x-100 motion-reduce:after:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm"
                >
                  {link.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Right: CTA / Mobile */}
          <div className="flex items-center gap-4">
            
            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-3 lg:gap-4">
              <a
                href={SAARTHI_CLASSES_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent('saarthi_classes_click', { location: 'navbar' })}
                title="Saarthi Classes"
                className="inline-flex h-9 w-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-[14px] border border-muted bg-surface text-xs font-medium text-primary transition-colors duration-200 hover:border-primary/40 hover:bg-sage lg:w-auto lg:px-3.5"
              >
                <GraduationCap aria-hidden="true" className="h-[15px] w-[15px]" />
                {/* Tablets get the icon alone; the label returns from lg up. */}
                <span className="sr-only lg:not-sr-only">Saarthi Classes</span>
                <span className="sr-only"> (opens classes.saarthilife.com in a new tab)</span>
              </a>
              <Link href={portalLink} className="whitespace-nowrap rounded-lg px-2 py-1 text-sm font-medium text-primary transition-colors duration-200 hover:text-primary-deep hover:bg-sage">
                {portalText}
              </Link>
              <Button asChild size="sm" variant="primary" onClick={handleBookClick}>
                <Link href="/book">Book Session</Link>
              </Button>
            </div>

            {/* Mobile */}
            <div className="md:hidden">
              <button
                onClick={() => setIsOpen(true)}
                className="rounded-full border border-muted bg-surface px-4 py-2 text-xs font-semibold tracking-[0.18em] uppercase text-primary transition-colors hover:border-primary/35"
              >
                Explore
              </button>
            </div>
          </div>
        </div>
      </div>

      <MobileMenu
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onBookClick={onBookClick}
        links={navLinks}
      />
    </nav>
  )
}

export default Navbar
