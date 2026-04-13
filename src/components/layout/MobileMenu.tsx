import * as React from "react"
import { motion, AnimatePresence } from "motion/react"
import { X } from "lucide-react"
import { Button } from "../ui/Button"
import { Link } from "react-router-dom"

interface MobileMenuProps {
  isOpen: boolean
  onClose: () => void
  links: { name: string; href: string }[]
}

const MobileMenu = ({ isOpen, onClose, links }: MobileMenuProps) => {
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] flex flex-col bg-[#f8f6f2] p-8 md:hidden"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between mb-16">
            <Link to="/" className="flex items-center gap-3 text-3xl font-bold tracking-tight text-primary font-serif" onClick={onClose}>
              <img 
                src="/saarthi-logo-Photoroom.png" 
                alt="Saarthi Logo" 
                className="h-10 w-auto object-contain" 
                referrerPolicy="no-referrer"
              />
              S
            </Link>
            <button
              onClick={onClose}
              className="p-2 text-primary hover:bg-primary/5 rounded-full transition-colors"
              aria-label="Close menu"
            >
              <X className="h-8 w-8" />
            </button>
          </div>

          {/* Menu Items */}
          <nav className="flex flex-col space-y-10">
            {links.map((link, index) => (
              <motion.div
                key={link.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 + 0.2 }}
              >
                <Link
                  to={link.href}
                  className="text-3xl font-serif font-medium text-primary hover:text-accent transition-colors"
                  onClick={onClose}
                >
                  {link.name}
                </Link>
              </motion.div>
            ))}
          </nav>

          {/* CTA Button */}
          <div className="mt-auto pb-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Button 
                className="w-full h-16 text-lg font-bold rounded-2xl bg-primary text-white hover:bg-primary/90" 
                onClick={onClose}
              >
                Book Session
              </Button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default MobileMenu
