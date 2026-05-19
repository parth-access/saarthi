"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { motion, AnimatePresence } from "motion/react";
import { Lock, User as UserIcon, Eye, EyeOff, Shield, ArrowRight, Heart } from "lucide-react";

export default function Login() {
  const router = useRouter();

  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login, register, currentUser } = useAuth();

  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'admin') {
        router.replace("/admin");
      } else if (currentUser.role === 'therapist') {
        router.replace("/therapist");
      } else if (currentUser.role === 'client') {
        router.replace("/dashboard");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [currentUser, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      if (isRegister) {
        if (!name) {
          throw new Error("Name is required");
        }
        await register(email, password, name);
      } else {
        await login(email, password);
      }
      // Wait for AuthContext and its onAuthStateChanged to resolve loading to false
    } catch (err: any) {
      setError(err.message || (isRegister ? "Registration failed" : "Login failed"));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBE7] flex flex-col md:flex-row pt-16">
      {/* Left side: Content / Forms */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 md:p-12 lg:p-24 relative z-10">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-[400px]"
        >
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-serif text-primary tracking-tight mb-3">
              {isRegister ? "Begin your journey" : "Welcome back"}
            </h1>
            <p className="text-primary/70 text-base leading-relaxed">
              {isRegister 
                ? "Create a safe space to track your progress and find the right support." 
                : "Step into your secure, private space for emotional well-being."}
            </p>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: 'auto' }} 
              className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-6 border border-red-100 flex items-start gap-3"
            >
              <Shield className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-primary/5">
            <form onSubmit={handleSubmit} className="space-y-5">
              <AnimatePresence mode="popLayout">
                {isRegister && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, overflow: "hidden" }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <label className="block text-sm font-medium mb-2 text-primary">
                      Full Name
                    </label>
                    <Input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="How should we call you?"
                      className="h-12 bg-[#FFFBE7]/50 focus:bg-white transition-colors"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <label className="block text-sm font-medium mb-2 text-primary">
                  Email
                </label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="h-12 bg-[#FFFBE7]/50 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-primary">
                  Password
                </label>
                <div className="relative group">
                  <Input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12 pr-12 bg-[#FFFBE7]/50 focus:bg-white transition-colors focus:ring-2 focus:ring-[#E6A520] focus:border-[#E6A520]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-primary/40 hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E6A520] rounded-r-md"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 drop-shadow-sm transition-transform duration-200" />
                    ) : (
                      <Eye className="h-5 w-5 drop-shadow-sm transition-transform duration-200" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 text-base font-medium rounded-xl group relative overflow-hidden"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                      {isRegister ? "Preparing your space..." : "Signing in..."}
                    </span>
                  ) : (
                    <>
                      {isRegister ? "Create Account" : "Sign In"}
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </span>
              </Button>
            </form>

            <div className="mt-8 pt-6 border-t border-primary/10 text-center">
              <button
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError("");
                }}
                className="text-sm text-primary/60 hover:text-primary transition-colors inline-flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary rounded-md p-1"
                type="button"
              >
                {isRegister ? (
                  <>Already have an account? <span className="font-medium text-primary">Sign In</span></>
                ) : (
                  <>Don't have an account? <span className="font-medium text-primary">Sign Up</span></>
                )}
              </button>
            </div>
          </div>
          
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-primary/40">
            <Lock className="w-3 h-3" />
            <p>Your data is securely encrypted and strictly private.</p>
          </div>
        </motion.div>
      </div>

      {/* Right side: Visuals / Reassurance */}
      <div className="hidden md:flex w-1/2 p-6 md:p-12 pl-0">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="w-full h-full bg-primary rounded-[2.5rem] relative overflow-hidden flex flex-col justify-between p-12 text-[#FFFBE7]"
        >
          {/* Subtle background pattern/gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-[#2a382f] opacity-80" />
          <div className="absolute -top-[20%] -right-[10%] w-[70%] h-[70%] rounded-full bg-[#E6A520] blur-[120px] opacity-10 mix-blend-screen" />
          <div className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-[#FFFBE7] blur-[100px] opacity-10 mix-blend-overlay" />

          <div className="relative z-10">
            <Heart className="w-10 h-10 text-[#E6A520] mb-8 opacity-80" />
            <h2 className="text-4xl lg:text-5xl font-serif leading-tight mb-6 max-w-md">
              A safe space for your mind to rest and grow.
            </h2>
            <p className="text-white/70 text-lg max-w-md leading-relaxed">
              We believe in honest, compassionate support. Join a community built on trust, privacy, and emotional safety.
            </p>
          </div>

          <div className="relative z-10 grid gap-6 max-w-md">
            {[
              { title: "Strictly Private", desc: "Your sessions, notes, and identity are fully protected." },
              { title: "Vetted Professionals", desc: "Connect with certified, compassionate therapists." },
              { title: "Your Pace", desc: "Move forward on your own timeline, without pressure." }
            ].map((item, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + (i * 0.1) }}
                key={i} 
                className="flex items-start gap-4"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[#E6A520] mt-2.5 shrink-0" />
                <div>
                  <h3 className="font-medium text-white mb-1">{item.title}</h3>
                  <p className="text-sm text-white/50">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}