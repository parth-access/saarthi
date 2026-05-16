import * as React from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "motion/react"
import { X } from "lucide-react"
import { Button } from "../ui/Button"
import Link from "next/link"

interface MobileMenuProps {
  isOpen: boolean
  onClose: () => void
  onBookClick?: () => void
  links: { name: string; href: string }[]
}

const MobileMenu = ({ isOpen, onClose, onBookClick, links }: MobileMenuProps) => {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Disable scroll when menu is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }
    return () => {
      document.body.style.overflow = "unset"
    }
  }, [isOpen])

  if (!mounted) return null;

  // Use Portal to render at the root of the document body
  // This avoids stacking context issues from parent components
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed inset-0 z-[9999] flex flex-col bg-background p-6 md:hidden"
        >
          {/* Top Bar: Logo (Left) + Close (Right) */}
          <div className="flex items-center justify-between mb-12">
            <Link href="/" className="flex items-center" onClick={onClose}>
              <img 
                src="/saarthi-logo-Photoroom.png" 
                alt="Saarthi Logo" 
                className="h-10 w-auto object-contain" 
                referrerPolicy="no-referrer"
              />
            </Link>
            <button
              onClick={onClose}
              className="p-2 text-primary hover:bg-primary/5 rounded-full transition-colors"
              aria-label="Close menu"
            >
              <X className="h-8 w-8 stroke-[1.5]" />
            </button>
          </div>

          {/* Middle: Navigation Links */}
          <nav className="flex flex-col space-y-6">
            {links.map((link, index) => (
              <motion.div
                key={link.name}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 + 0.2 }}
              >
                <Link href={link.href}
                  className="text-4xl font-serif font-medium text-primary hover:text-accent transition-colors"
                  onClick={onClose}
                >
                  {link.name}
                </Link>
              </motion.div>
            ))}
          </nav>

          {/* Bottom: Primary CTA */}
          <div className="mt-auto pb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <Button 
                asChild
                className="w-full h-14 text-base font-bold tracking-wider uppercase rounded-full bg-primary text-white hover:bg-primary/90 shadow-xl shadow-primary/10" 
              >
                <Link href="/therapists" onClick={onClose}>
                  Book a Session
                </Link>
              </Button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default MobileMenu
