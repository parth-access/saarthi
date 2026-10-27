"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { betterAuthService } from "@/services/betterAuthService";
import { FloatingInput } from "@/components/auth/FloatingInput";
import { AuthCard, AuthError, AuthSubmit } from "@/components/auth/AuthCard";

/**
 * Where Better Auth's reset link lands: /reset-password?token=…, or
 * ?error=INVALID_TOKEN when the link is expired or already used.
 */
function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const linkError = searchParams.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token || linkError) {
    return (
      <AuthCard title="This link has expired" subtitle="Reset links work once and expire after 1 hour. Request a new one and use the latest email.">
        <Link
          href="/forgot-password"
          className="w-full h-14 bg-primary text-white rounded-2xl font-medium flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Send a new link
        </Link>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Password updated" subtitle="You can now sign in with your new password. For your security, you've been signed out on your other devices.">
        <Link
          href="/login"
          className="w-full h-14 bg-primary text-white rounded-2xl font-medium flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Sign in
        </Link>
      </AuthCard>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await betterAuthService.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setError(
        code === "auth/network-request-failed"
          ? "We couldn't reach the server. Check your connection and try again."
          : "This link has expired or was already used. Please request a new one."
      );
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => {
    if (error) setError("");
  };

  return (
    <AuthCard title="Choose a new password" subtitle="Use at least 8 characters.">
      {error && <AuthError>{error}</AuthError>}
      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
        <FloatingInput
          id="reset-password"
          name="new-password"
          autoComplete="new-password"
          icon={Lock}
          label="New password"
          type="password"
          required
          isPassword
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearError();
          }}
          showPassword={showPassword}
          togglePassword={() => setShowPassword(!showPassword)}
        />
        <FloatingInput
          id="reset-password-confirm"
          name="confirm-password"
          autoComplete="new-password"
          icon={Lock}
          label="Confirm new password"
          type="password"
          required
          isPassword
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            clearError();
          }}
          showPassword={showPassword}
          togglePassword={() => setShowPassword(!showPassword)}
        />
        <div className="pt-2">
          <AuthSubmit loading={loading} label="Update password" loadingLabel="Updating..." />
        </div>
      </form>
    </AuthCard>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-background" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
