"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { authService } from "@/services/authService";
import { FloatingInput } from "@/components/auth/FloatingInput";
import { AuthCard, AuthError, AuthSubmit } from "@/components/auth/AuthCard";

function friendlyError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait a few minutes and try again.";
  if (code === "auth/invalid-email") return "Please enter a valid email address.";
  if (code === "auth/network-request-failed") return "We couldn't reach the server. Check your connection and try again.";
  return "We couldn't send the reset link. Please try again.";
}

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await authService.requestPasswordReset(trimmed);
      setSentTo(trimmed);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <AuthCard title="Check your email" subtitle={`If an account exists for ${sentTo}, we've sent a link to reset your password. It expires in 1 hour.`}>
        <p className="text-sm text-primary/60">
          Didn&apos;t get it? Check your spam folder, or{" "}
          <button type="button" onClick={() => setSentTo(null)} className="font-medium text-accent hover:underline">
            try again
          </button>
          .
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot your password?" subtitle="Enter the email you signed up with and we'll send you a link to choose a new one.">
      {error && <AuthError>{error}</AuthError>}
      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
        <FloatingInput
          id="forgot-email"
          name="email"
          autoComplete="email"
          icon={Mail}
          label="Email address"
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError("");
          }}
        />
        <div className="pt-2">
          <AuthSubmit loading={loading} label="Send reset link" loadingLabel="Sending..." />
        </div>
      </form>
      <p className="mt-8 text-center text-sm text-primary/60">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
