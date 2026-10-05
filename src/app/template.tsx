"use client";



import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { theme } from "@/components/ui/DashboardCard";

export default function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
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
