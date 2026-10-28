"use client";



import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { theme } from "@/components/ui/DashboardCard";

export default function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The admin console is a tool, not a story: its rail and top bar must not
  // blur out and back in on every section change, and AnimatePresence's
  // "wait" mode would hold each new page back until the old one had faded.
  if (pathname?.startsWith("/admin")) return <>{children}</>;

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
