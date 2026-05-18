"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { motion } from "motion/react";
import { Lock, User as UserIcon, Eye, EyeOff } from "lucide-react";

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
    <div className="pt-32 pb-24 min-h-[80vh] flex flex-col items-center justify-center container mx-auto px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white p-8 rounded-[2rem] shadow-sm border border-primary/10"
      >
        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-6 mx-auto">
          {isRegister ? <UserIcon className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
        </div>

        <h1 className="text-2xl font-serif text-center text-primary mb-2">
          {isRegister ? "Create an Account" : "Platform Login"}
        </h1>

        <p className="text-center text-muted-foreground mb-8 text-sm">
          {isRegister 
            ? "Sign up to track your therapy progress." 
            : "Sign in to manage your bookings or practice."}
        </p>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 text-center border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-sm font-medium mb-1.5 text-primary">
                Full Name
              </label>

              <Input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1.5 text-primary">
              Email
            </label>

            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5 text-primary">
              Password
            </label>
            <div className="relative group">
              <Input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pr-10 transition-colors focus:ring-2 focus:ring-[#E6A520] focus:border-[#E6A520]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-primary/40 hover:text-primary transition-colors focus:outline-none"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 drop-shadow-sm transition-transform duration-200" />
                ) : (
                  <Eye className="h-4 w-4 drop-shadow-sm transition-transform duration-200" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full mt-4 h-12 text-base"
          >
            {loading ? (isRegister ? "Creating account..." : "Signing in...") : (isRegister ? "Create Account" : "Sign In")}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm">
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
            }}
            className="text-primary/70 hover:text-primary transition-colors hover:underline"
            type="button"
          >
            {isRegister ? "Already have an account? Sign In" : "Need an account? Sign Up"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}