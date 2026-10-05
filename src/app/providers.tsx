"use client";
import React from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { MotionProvider } from "@/components/MotionProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <MotionProvider>
        {children}
      </MotionProvider>
    </AuthProvider>
  );
}
