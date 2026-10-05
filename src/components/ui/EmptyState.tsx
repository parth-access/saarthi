import * as React from "react"
import { motion, HTMLMotionProps } from "framer-motion"
import { cn } from "../../lib/utils"
import { LucideIcon } from "lucide-react"

interface EmptyStateProps extends HTMLMotionProps<"div"> {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
  illustration?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, className, illustration = true, ...props }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn("flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-white/50 border border-primary/5 rounded-[2rem]", className)}
      {...props}
    >
      {illustration && (
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-accent/10 blur-xl rounded-full" />
          <div className="w-16 h-16 rounded-2xl bg-white border border-primary/5 shadow-sm flex items-center justify-center relative z-10">
            <Icon className="w-8 h-8 text-accent" />
          </div>
        </div>
      )}
      {!illustration && (
        <Icon className="w-10 h-10 text-primary/20 mb-4" />
      )}
      <h3 className="text-xl font-serif text-primary mb-2">{title}</h3>
      <p className="text-sm text-primary/60 max-w-sm mb-6 leading-relaxed">
        {description}
      </p>
      {action && <div>{action}</div>}
    </motion.div>
  )
}
