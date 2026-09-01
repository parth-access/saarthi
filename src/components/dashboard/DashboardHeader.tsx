"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, LayoutGrid, CalendarDays, FileText, Sparkles, Menu, X } from "lucide-react";

/**
 * Shared chrome for every client dashboard page: Saarthi branding, primary nav,
 * an initials avatar with the signed-in name, and a working logout. Rendered
 * once by src/app/dashboard/layout.tsx so all sub-pages share one header.
 */

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/dashboard/bookings", label: "Sessions", icon: CalendarDays },
  { href: "/dashboard/receipts", label: "Receipts", icon: FileText },
  { href: "/dashboard/resources", label: "Wellness", icon: Sparkles },
];

function initialsFor(name?: string, email?: string): string {
  const source = (name || email || "").trim();
  if (!source) return "U";
  if (name) {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "U";
  }
  return source.charAt(0).toUpperCase();
}

export function DashboardHeader({ displayName }: { displayName?: string }) {
  const { currentUser, logout } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const name = displayName || currentUser?.name || currentUser?.email?.split("@")[0] || "";
  const initials = initialsFor(displayName || currentUser?.name, currentUser?.email || undefined);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="fixed top-0 inset-x-0 z-40 border-b border-primary/5 bg-[#FFFBE7]/85 backdrop-blur-md print:hidden">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Brand */}
          <Link href="/dashboard" className="group flex items-center gap-2 text-primary font-serif shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/saarthi-logo-Photoroom.png"
              alt="Saarthi"
              className="h-9 w-auto object-contain transition-transform group-hover:scale-105"
              referrerPolicy="no-referrer"
            />
            <span className="hidden sm:inline text-xl font-semibold tracking-tight">Saarthi</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Dashboard">
            {NAV.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium transition-colors font-sans ${
                    active ? "bg-primary text-white shadow-sm" : "text-primary/70 hover:text-primary hover:bg-black/5"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right: identity + logout */}
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/profile"
              className="hidden sm:flex items-center gap-2.5 group"
              title="Edit profile"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/10 flex items-center justify-center text-primary font-semibold text-sm group-hover:bg-primary/15 transition-colors">
                {initials}
              </div>
              <span className="hidden lg:block text-sm font-medium text-primary max-w-[140px] truncate font-sans">
                {name}
              </span>
            </Link>
            <button
              onClick={logout}
              className="hidden md:flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-white border border-primary/10 hover:bg-black/5 transition-colors rounded-full shadow-sm cursor-pointer font-sans"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="md:hidden p-2 rounded-full text-primary hover:bg-black/5 transition-colors"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-primary/5 bg-[#FFFBE7] px-4 py-3 space-y-1 font-sans">
          {NAV.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-colors ${
                  active ? "bg-primary text-white" : "text-primary/70 hover:bg-black/5"
                }`}
              >
                <item.icon className="w-4 h-4" /> {item.label}
              </Link>
            );
          })}
          <Link
            href="/dashboard/profile"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium text-primary/70 hover:bg-black/5"
          >
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-[10px]">
              {initials}
            </div>
            {name || "Profile"}
          </Link>
          <button
            onClick={() => { setMobileOpen(false); logout(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium text-red-600 hover:bg-red-50 cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      )}
    </header>
  );
}
