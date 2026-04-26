import * as React from "react"
import { motion, AnimatePresence } from "motion/react"
import { X, Lock, ShieldCheck, AlertCircle } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "../ui/Button"
import { Input } from "../ui/Input"
import { apiClient } from "../../lib/api"

import { useAuth } from "../../contexts/AuthContext"

interface AdminAuthModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AdminAuthModal({ isOpen, onClose }: AdminAuthModalProps) {
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const navigate = useNavigate()
  const { login, user } = useAuth()

  // If user is already an admin, navigate and close
  React.useEffect(() => {
    if (user?.role === 'admin' && isOpen) {
      onClose()
      navigate("/admin")
    }
  }, [user, isOpen, onClose, navigate])

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    setError("")
    try {
      await login()
      // The ProtectedRoute or useEffect will handle navigation
    } catch (err) {
      setError("Google sign-in failed. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      // Validate the password using the common auth validation route
      const result = await apiClient('/auth/me', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${password}` },
        requireAuth: false
      });

      if (result.success && result.data?.role === 'admin') {
        localStorage.setItem("adminToken", password)
        localStorage.setItem("isAdminAuthenticated", "true")
        onClose()
        setPassword("")
        navigate("/admin")
      } else {
        setError("Invalid administrative key")
      }
    } catch (err) {
      setError("System unavailable. Please try again later.")
    } finally {
      setIsLoading(false)
    }
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

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-primary/10" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[#FFFBE7] px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <Button 
                  type="button"
                  variant="outline"
                  className="w-full h-14 text-base rounded-2xl bg-white border-primary/10 hover:bg-primary/5"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="h-5 w-5 mr-2" />
                  Sign in with Google
                </Button>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
