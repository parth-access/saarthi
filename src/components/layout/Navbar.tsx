import * as React from "react"
import { Button } from "../ui/Button"
import MobileMenu from "./MobileMenu"
import { Link } from "react-router-dom"

interface NavbarProps {
  onBookClick?: () => void;
}

const Navbar = ({ onBookClick }: NavbarProps) => {
  const [isOpen, setIsOpen] = React.useState(false)

  const navLinks = [
    { name: "Therapists", href: "/therapists" },
    { name: "About", href: "/about" },
    { name: "Our Vision", href: "/vision" },
    { name: "Contact", href: "/#contact" },
  ]

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-primary/5 bg-background/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* ✅ Reduced height for better balance */}
        <div className="flex h-16 items-center justify-between">
          
          {/* Left: Logo */}
          <div className="flex items-center">
            <Link
              to="/"
              className="group flex items-center gap-2 text-primary font-serif transition-transform hover:scale-[1.02]"
            >
              {/* ✅ Use icon-style logo (IMPORTANT) */}
              <img
                src="/saarthi-logo-Photoroom.png" // <-- use your simplified icon version
                alt="Saarthi"
                className="h-10 md:h-12 w-auto object-contain transition-transform duration-200 group-hover:scale-105"
              />

              {/* ✅ Clean text */}
              <span className="hidden md:inline text-2xl font-semibold tracking-tight">
                Saarthi
              </span>
            </Link>
          </div>

          {/* Center: Desktop Links */}
          <div className="hidden md:flex flex-1 justify-center">
            <div className="flex items-center space-x-10">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.href}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  {link.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Right: CTA / Mobile */}
          <div className="flex items-center">
            {/* Desktop CTA */}
            <div className="hidden md:block">
              <Button size="default" variant="primary" onClick={onBookClick}>
                Book Session
              </Button>
            </div>

            {/* Mobile */}
            <div className="md:hidden">
              <button
                onClick={() => setIsOpen(true)}
                className="text-xs font-bold tracking-[0.2em] uppercase text-primary hover:opacity-70 transition-opacity"
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