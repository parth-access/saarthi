"use client";

import React from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";

/**
 * Shared shell for all client dashboard pages. Renders the fixed dashboard
 * header (branding, nav, avatar, logout); individual pages own their content
 * and keep their existing top padding to clear the fixed header.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FFFBE7]">
      <DashboardHeader />
      {children}
    </div>
  );
}
