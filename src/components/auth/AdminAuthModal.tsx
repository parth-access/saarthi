import * as React from "react"
import { motion, AnimatePresence } from "motion/react"
import { X, Lock, ShieldCheck, AlertCircle } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "../ui/Button"
import { Input } from "../ui/Input"

interface AdminAuthModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AdminAuthModal({ isOpen, onClose }: AdminAuthModalProps) {
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const navigate = useNavigate()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    // Simulate small delay for better UX
    setTimeout(() => {
      // The password requested by the user: "saarthi-admmin" (intentional typo included)
      if (password === "saarthi-admmin") {
        localStorage.setItem("isAdminAuthenticated", "true")
        onClose()
        navigate("/admin")
      } else {
        setError("Invalid administrative credentials.")
      }
      setIsLoading(false)
    }, 500)
  }

  React.useEffect(() => {
    if (isOpen) {
      setPassword("")
      setError("")
      // Prevent body scroll
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
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="w-full max-w-md bg-[#FFFBE7] rounded-[2.5rem] shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8 md:p-10">
              <div className="flex justify-between items-start mb-6">
                <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-8">
                <h2 className="text-2xl font-serif text-primary mb-2">Admin Portal</h2>
                <p className="text-muted-foreground text-sm">
                  Please enter your password to access the management dashboard.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label 
                    htmlFor="admin-password" 
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="admin-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter administrative code"
                      className="pl-10 h-14 bg-white border-primary/10 focus:border-primary rounded-2xl"
                      autoFocus
                    />
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 text-red-600 text-xs bg-red-50 p-3 rounded-xl border border-red-100"
                  >
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                  </motion.div>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-14 text-base rounded-2xl"
                  disabled={isLoading}
                >
                  {isLoading ? "Verifying..." : "Access Dashboard"}
                </Button>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
