"use client";

import React from "react";
import { motion } from "framer-motion";
import { BackLink } from "@/components/navigation/BackLink";

/** The login page's card, for the smaller auth pages (forgot / reset password). */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[520px]"
      >
        <div className="bg-white/[0.95] backdrop-blur-xl rounded-[2.5rem] shadow-[0_8px_40px_rgb(0,0,0,0.04)] border border-white p-8 sm:p-10 md:p-14">
          <BackLink href="/login" label="Back to sign in" className="mb-6 text-primary/60 hover:text-primary" />
          <h1 className="text-3xl sm:text-4xl font-serif text-primary tracking-tight mb-3">{title}</h1>
          <p className="text-primary/60 text-sm sm:text-base leading-relaxed mb-8">{subtitle}</p>
          {children}
        </div>
      </motion.div>
    </div>
  );
}

export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" aria-live="polite" className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm mb-6 border border-red-100">
      {children}
    </div>
  );
}

export function AuthSubmit({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full h-14 bg-primary text-white rounded-2xl font-medium tracking-wide flex items-center justify-center shadow-[0_4px_20px_rgba(31,94,59,0.2)] border border-primary/20 disabled:opacity-50 select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {loading ? loadingLabel : label}
    </button>
  );
}
