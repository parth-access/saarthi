"use client";

import React from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardDataProvider } from "@/components/dashboard/DashboardDataContext";

/**
 * Shared shell for all client dashboard pages. Renders the fixed dashboard
 * header (branding, nav, avatar, logout); individual pages own their content
 * and keep their existing top padding to clear the fixed header.
 *
 * The bookings are read here, once, and shared with the pages, so moving
 * between Overview and My Sessions shows them instantly instead of re-reading.
 * Each page still gates on the signed-in role with its own ProtectedRoute.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FFFBE7]">
      <DashboardHeader />
      <DashboardDataProvider>{children}</DashboardDataProvider>
    </div>
  );
}
