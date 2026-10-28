"use client";



import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { theme } from "@/components/ui/DashboardCard";

export default function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The admin console and the therapist workspace are tools, not a story: their
  // rail and top bar must not blur out and back in on every section change, and
  // AnimatePresence's "wait" mode would hold each new page back until the old one
  // had faded. The keyed wrapper also remounts the segment layout on every
  // navigation, which made the therapist workspace re-read all of its data on
  // each tab change instead of once.
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/therapist")) return <>{children}</>;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, filter: "blur(4px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, filter: "blur(4px)" }}
        transition={theme.animation.transition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
