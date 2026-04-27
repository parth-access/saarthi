import * as React from "react"
import { Button } from "../ui/Button"
import MobileMenu from "./MobileMenu"
import { Link } from "react-router-dom"
import { LayoutDashboard, User as UserIcon, LogOut } from "lucide-react"
import { useAuth } from "../../contexts/AuthContext"

interface NavbarProps {
  onBookClick?: () => void;
  onLoginClick?: () => void;
}

const Navbar = ({ onBookClick, onLoginClick }: NavbarProps) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const { currentUser, logout } = useAuth()

  const navLinks = [
    { name: "Therapists", href: "/therapists" },
    { name: "About", href: "/about" },
    { name: "Our Vision", href: "/vision" },
    { name: "Contact", href: "/contact" },
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
                referrerPolicy="no-referrer"
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
              {(currentUser?.role === 'admin' || currentUser?.role === 'therapist') && (
                <Link
                  to="/admin"
                  className="text-sm font-medium text-primary transition-colors hover:opacity-80 flex items-center gap-1"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
              )}
            </div>
          </div>

          {/* Right: CTA / Mobile */}
          <div className="flex items-center gap-4">
            
            {/* User Profile / Login */}
            <div className="hidden md:flex items-center gap-2">
              {currentUser ? (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-medium text-primary line-clamp-1">{currentUser.email}</span>
                    <button 
                      onClick={logout}
                      className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                    >
                      <LogOut className="h-3 w-3" />
                      Logout
                    </button>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <UserIcon className="h-4 w-4" />
                  </div>
                </div>
              ) : (
                <Button variant="ghost" size="sm" onClick={onLoginClick} className="text-sm font-medium">
                  Login
                </Button>
              )}
            </div>

            {/* Desktop CTA */}
            <div className="hidden md:block">
              <Button asChild size="sm" variant="primary">
                <Link to="/book">Book Session</Link>
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
