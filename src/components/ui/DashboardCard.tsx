import * as React from "react"
import { motion, HTMLMotionProps } from "framer-motion"
import { cn } from "../../lib/utils"

export const theme = {
  colors: {
    primary: "var(--color-primary)",
    accent: "var(--color-accent)",
    background: "var(--color-background)",
  },
  animation: {
    transition: { ease: "easeOut", duration: 0.3 } as const,
    spring: { type: "spring", stiffness: 200, damping: 20 } as const,
  },
}

interface DashboardCardProps extends HTMLMotionProps<"div"> {
  className?: string;
  children: React.ReactNode;
  hoverable?: boolean;
}

export function DashboardCard({ className, children, hoverable = false, ...props }: DashboardCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={theme.animation.transition}
      whileHover={hoverable ? { y: -2 } : {}}
      className={cn(
        "bg-white rounded-[2rem] p-6 sm:p-8 shadow-sm border border-primary/5",
        hoverable && "hover:border-primary/10 hover:shadow-md transition-shadow",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  )
}
