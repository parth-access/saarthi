"use client";


import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, User as UserIcon, Eye, EyeOff, Shield, ArrowRight, Heart, Mail, Users, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface FloatingInputProps {
  icon: React.ElementType;
  label: string;
  type: string;
  required?: boolean;
  isPassword?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showPassword?: boolean;
  togglePassword?: () => void;
}

const FloatingInput = ({ icon: Icon, label, type, required = false, isPassword = false, value, onChange, showPassword, togglePassword }: FloatingInputProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const isActive = isFocused || value.length > 0;

  return (
    <motion.div 
       initial={false}
       animate={{ 
          y: isFocused ? -2 : 0, 
          boxShadow: isFocused ? "0 4px 20px rgba(230, 165, 32, 0.08)" : "0 0px 0px rgba(0,0,0,0)"
       }}
       className={`relative rounded-2xl border transition-colors duration-300 ${isFocused ? 'border-[#E6A520] bg-white' : 'border-primary/10 bg-primary/[0.02] hover:border-primary/20 hover:bg-primary/[0.04]'} flex overflow-hidden`}
    >
       <div className={`w-12 flex items-center justify-center shrink-0 transition-colors duration-300 ${isFocused ? 'text-[#E6A520]' : 'text-primary/40'}`}>
          <Icon className="w-5 h-5" />
       </div>
       
       <div className="relative flex-1">
         <motion.label
           initial={false}
           animate={{
              y: isActive ? 8 : 16,
              scale: isActive ? 0.75 : 1,
              opacity: isActive ? 0.8 : 0.6
           }}
           className={`absolute left-0 top-0 text-sm font-medium origin-left pointer-events-none transition-colors duration-300 ${isFocused ? "text-[#E6A520]" : "text-primary"}`}
         >
           {label}
         </motion.label>
  
         <input
           type={isPassword && !showPassword ? "password" : type}
           value={value}
           onChange={onChange}
           onFocus={() => setIsFocused(true)}
           onBlur={() => setIsFocused(false)}
           required={required}
           className="w-full h-14 bg-transparent text-primary text-sm font-medium focus:outline-none pt-5 pb-1 pr-4"
         />
       </div>

       {isPassword && (
          <button 
             type="button"
             onClick={togglePassword}
             className="w-12 flex items-center justify-center shrink-0 text-primary/40 hover:text-primary transition-colors focus:outline-none"
             aria-label="Toggle password visibility"
          >
             <AnimatePresence mode="wait">
               {showPassword ? (
                 <motion.div key="eye-off" initial={{ opacity: 0, scale: 0.5, rotate: -45 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.5, rotate: 45 }} transition={{ duration: 0.15 }}>
                    <EyeOff className="w-4 h-4" />
                 </motion.div>
               ) : (
                 <motion.div key="eye" initial={{ opacity: 0, scale: 0.5, rotate: -45 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.5, rotate: 45 }} transition={{ duration: 0.15 }}>
                    <Eye className="w-4 h-4" />
                 </motion.div>
               )}
             </AnimatePresence>
          </button>
       )}
    </motion.div>
  )
}

export default function Login() {
  const router = useRouter();

  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login, register, loginWithGoogle, currentUser } = useAuth();

  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'admin') {
        router.replace("/admin");
      } else if (currentUser.role === 'therapist') {
        router.replace("/therapist");
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
        toast.success("Welcome to Saarthi");
      } else {
        await login(email, password);
        toast.success("Welcome back");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError((err instanceof Error ? err.message : String(err)) || (isRegister ? "Registration failed" : "Login failed"));
      } else {
        setError(isRegister ? "Registration failed" : "Login failed");
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#FFFBE7] flex flex-col md:flex-row relative">
      
      {/* Mobile Header Graphic (hidden on md) */}
      <div className="md:hidden h-[25dvh] flex items-center justify-center relative overflow-hidden bg-primary shrink-0">
         <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-[#2a382f]" />
         <div className="absolute -bottom-10 right-0 w-40 h-40 bg-[#E6A520] rounded-full blur-3xl opacity-20" />
         <Heart className="w-10 h-10 text-[#E6A520] relative z-10 opacity-90" />
      </div>

      {/* Left side: Form */}
      <div className="w-full md:w-1/2 flex-1 flex items-center justify-center p-4 sm:p-6 md:p-12 relative z-20 -mt-8 md:mt-0">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[520px] relative"
        >
          {/* Glassmorphic Auth Card */}
          <div className="bg-white/[0.95] backdrop-blur-xl rounded-[2.5rem] shadow-[0_8px_40px_rgb(0,0,0,0.04)] border border-white p-8 sm:p-10 md:p-14 hover:shadow-[0_16px_60px_rgb(0,0,0,0.08)] transition-shadow duration-500">
            <div className="mb-8 min-h-[96px]">
              <AnimatePresence mode="wait">
                  <motion.div
                    key={isRegister ? "register" : "login"}
                    initial={{ opacity: 0, filter: "blur(4px)", y: 10 }}
                    animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                    exit={{ opacity: 0, filter: "blur(4px)", y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h1 className="text-3xl sm:text-4xl font-serif text-primary tracking-tight mb-3">
                      {isRegister ? "Begin your journey" : "Welcome back"}
                    </h1>
                    <p className="text-primary/60 text-sm sm:text-base leading-relaxed">
                      {isRegister 
                        ? "Create a safe space to track your progress and find the right support." 
                        : "Step into your secure, private space for emotional well-being."}
                    </p>
                  </motion.div>
              </AnimatePresence>
            </div>

            <AnimatePresence mode="popLayout">
              {error && (
                <motion.div 
                   initial={{ opacity: 0, y: -10, scale: 0.98 }} 
                   animate={{ opacity: 1, y: 0, scale: 1 }} 
                   exit={{ opacity: 0, scale: 0.98, height: 0 }}
                   className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm mb-6 border border-red-100 flex items-start gap-3 shadow-sm"
                >
                  <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-4">
              <AnimatePresence mode="popLayout">
                {isRegister && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, filter: "blur(4px)" }}
                    animate={{ opacity: 1, height: "auto", filter: "blur(0px)" }}
                    exit={{ opacity: 0, height: 0, filter: "blur(4px)" }}
                    transition={{ duration: 0.3 }}
                  >
                    <FloatingInput 
                      icon={UserIcon}
                      label="Full Name"
                      type="text"
                      required
                      value={name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <FloatingInput 
                icon={Mail}
                label="Email address"
                type="email"
                required
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              />

              <FloatingInput 
                icon={Lock}
                label="Password"
                type="password"
                required
                isPassword
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                showPassword={showPassword}
                togglePassword={() => setShowPassword(!showPassword)}
              />

              <div className="pt-2">
                <motion.button
                  type="submit"
                  disabled={loading}
                  whileHover={{ scale: 1.01, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full h-14 bg-primary text-white rounded-2xl font-medium tracking-wide relative overflow-hidden flex items-center justify-center group shadow-[0_4px_20px_rgba(31,94,59,0.2)] hover:shadow-[0_8px_30px_rgba(31,94,59,0.3)] transition-shadow border border-primary/20"
                >
                  <motion.div
                    initial={{ x: "-100%" }}
                    whileHover={{ x: "200%" }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    className="absolute inset-0 w-[150%] bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12"
                  />
                  <span className="relative z-10 flex items-center gap-2">
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
                </motion.button>
              </div>
            </form>

            <div className="mt-8 relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-primary/10"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-primary/50 text-xs uppercase tracking-widest font-medium">Or continue with</span>
              </div>
            </div>

            <div className="mt-8">
               <motion.button
                  type="button"
                  whileHover={{ scale: 1.01, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      await loginWithGoogle();
                      toast.success("Welcome back");
                    } catch (err: unknown) {
                      if (err instanceof Error) {
                        setError((err instanceof Error ? err.message : String(err)) || "Google authentication failed");
                      } else {
                        setError("Google authentication failed");
                      }
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="w-full h-14 bg-white border border-primary/20 text-primary rounded-2xl font-medium tracking-wide flex items-center justify-center gap-3 hover:bg-primary/[0.02] hover:border-primary/30 transition-all shadow-sm hover:shadow-md disabled:opacity-50"
               >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                     <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                     <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                     <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                     <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Google
               </motion.button>
            </div>

            <div className="mt-8 pt-6 border-t border-primary/10 flex flex-col items-center">
              <button
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError("");
                }}
                className="text-sm text-primary/60 hover:text-primary transition-colors inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary rounded-md p-1"
                type="button"
              >
                {isRegister ? (
                  <>Already have an account? <span className="font-medium text-[#E6A520]">Sign In</span></>
                ) : (
                  <>Don&apos;t have an account? <span className="font-medium text-[#E6A520]">Sign Up</span></>
                )}
              </button>
            </div>
          </div>
          
          <div className="mt-8 flex justify-center text-center">
            <div className="inline-flex flex-col sm:flex-row items-center gap-2 px-4 py-2 bg-primary/5 rounded-full backdrop-blur-sm border border-primary/10">
              <Lock className="w-3.5 h-3.5 text-[#E6A520]" />
              <p className="text-xs font-medium text-primary/60">Your data is securely encrypted and strictly private.</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right side: Visuals / Reassurance (Hidden on mobile) */}
      <div className="hidden md:flex w-1/2 min-h-screen bg-primary relative overflow-hidden flex-col items-center justify-center">
        {/* Ambient Glowing Blobs */}
        <motion.div 
          animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }} 
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-[20%] -right-[10%] w-[80%] h-[80%] rounded-full bg-gradient-to-br from-[#E6A520]/20 to-transparent blur-[100px] mix-blend-screen pointer-events-none"
        />
        <motion.div 
          animate={{ scale: [1, 1.3, 1], rotate: [0, -90, 0] }} 
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[80%] rounded-full bg-gradient-to-tr from-[#FFFBE7]/10 to-transparent blur-[80px] mix-blend-overlay pointer-events-none"
        />
        
        {/* Decorative Grid */}
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay pointer-events-none" />

        <div className="w-full h-full flex flex-col justify-center p-12 lg:p-24 relative z-10">
          
          {/* Floating Stat Chip */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0, y: [0, -10, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", opacity: { duration: 0.8 }, x: { duration: 0.8 } }}
            className="absolute top-[15%] right-[15%] bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center gap-3 shadow-2xl"
          >
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <p className="text-white font-medium text-sm whitespace-nowrap">10k+ Members</p>
              <p className="text-white/60 text-xs">Finding peace daily</p>
            </div>
          </motion.div>

          {/* Floating Trust Card */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0, y: [0, 10, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.5, opacity: { duration: 0.8 }, x: { duration: 0.8 } }}
            className="absolute bottom-[20%] left-[10%] bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center gap-3 shadow-2xl max-w-[220px]"
          >
            <div className="w-10 h-10 rounded-full bg-[#E6A520]/20 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-[#E6A520]" />
            </div>
            <div>
              <p className="text-white font-medium text-sm">Bank-grade Security</p>
              <p className="text-white/60 text-xs line-clamp-2">Your privacy and data are absolutely secure.</p>
            </div>
          </motion.div>

          <div className="max-w-xl">
             <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
               <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-md shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-[#E6A520] animate-pulse" />
                  <span className="text-xs font-medium text-white/80 uppercase tracking-widest">Wellness Redefined</span>
               </div>
             </motion.div>
             
             <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="text-4xl lg:text-5xl xl:text-6xl font-serif text-white mb-6 leading-[1.1]">
               A quiet space for<br />
               <span className="text-[#E6A520] italic">your mind</span>
             </motion.h2>
             
             <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="text-lg text-white/70 max-w-md leading-relaxed mb-12">
               Join a community built on trust, privacy, and emotional safety. Move forward at your own pace alongside dedicated professionals.
             </motion.p>
             
             <div className="flex flex-col gap-3 mb-10">
                {[
                  "Private & encrypted",
                  "Licensed professionals",
                  "Flexible scheduling",
                  "Personalized support journey"
                ].map((benefit, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, x: -10 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    transition={{ delay: 0.6 + i * 0.1, duration: 0.5 }}
                    className="flex items-center gap-3 text-white/80"
                  >
                    <div className="w-5 h-5 rounded-full bg-[#E6A520]/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#E6A520]" />
                    </div>
                    <span className="text-sm font-medium">{benefit}</span>
                  </motion.div>
                ))}
             </div>

             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} className="flex items-center gap-2 text-white/40 border-t border-white/10 pt-6 max-w-md">
               <Shield className="w-4 h-4 text-[#E6A520]/50" />
               <span className="text-xs">Trusted by students & professionals worldwide.</span>
             </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
