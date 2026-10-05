"use client";


import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--color-background)",
          color: "var(--color-primary)",
          border: "1px solid rgba(230, 165, 32, 0.2)", // accent
          borderRadius: "1rem",
        },
        className: "shadow-sm font-sans",
      }}
    />
  );
}
