import Image from "next/image";
import * as React from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, GraduationCap, ArrowUpRight } from "lucide-react"
import { Button } from "../ui/Button"
import Link from "next/link"
import { trackEvent } from "@/lib/analytics"
import { SAARTHI_CLASSES_URL } from "@/constants/links"

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

  // Close the menu with the Escape key for keyboard users
  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose])

  if (!mounted) return null;

  // Use Portal to render at the root of the document body
  // This avoids stacking context issues from parent components
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col bg-background p-6 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          {/* Top Bar: Logo (Left) + Close (Right) */}
          <div className="flex items-center justify-between mb-12">
            <Link href="/" className="flex items-center" onClick={onClose}>
              <Image
                src="/saarthi-logo.webp"
                alt="Saarthi Logo"
                width={256}
                height={256}
                className="h-10 w-auto object-contain"
              />
            </Link>
            <button
              onClick={onClose}
              className="p-2 text-primary hover:bg-sage rounded-xl transition-colors"
              aria-label="Close menu"
            >
              <X className="h-8 w-8 stroke-[1.5]" />
            </button>
          </div>

          {/* Middle: Navigation Links */}
          <nav className="flex flex-col gap-5">
            {links.map((link, index) => (
              <motion.div
                key={link.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 + 0.12, duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
              >
                <Link href={link.href}
                  className="text-4xl font-serif font-medium text-primary-ink hover:text-primary transition-colors"
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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              className="space-y-3"
            >
              <a
                href={SAARTHI_CLASSES_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  trackEvent('saarthi_classes_click', { location: 'mobile_menu' });
                  onClose();
                }}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-muted bg-surface text-sm font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-sage"
              >
                <GraduationCap aria-hidden="true" className="h-4 w-4" />
                Saarthi Classes
                <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                <span className="sr-only"> (opens classes.saarthilife.com in a new tab)</span>
              </a>
              <Button 
                asChild
                className="w-full h-14 text-base font-medium" 
                onClick={() => {
                  trackEvent('book_demo_click', {
                    location: 'mobile_menu',
                    cta_text: 'Book a Session'
                  });
                  onClose();
                  if (onBookClick) onBookClick();
                }}
              >
                <Link href="/book" onClick={onClose}>
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
