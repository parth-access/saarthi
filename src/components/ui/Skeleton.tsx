import * as React from "react"
import { motion, HTMLMotionProps } from "framer-motion"
import { cn } from "../../lib/utils"

interface SkeletonProps extends HTMLMotionProps<"div"> {
  className?: string
}

export function Skeleton({
  className,
  ...props
}: SkeletonProps) {
  return (
    <motion.div
      initial={{ opacity: 0.5 }}
      animate={{ opacity: 1 }}
      transition={{
        repeat: Infinity,
        repeatType: "reverse",
        duration: 1.5,
        ease: "easeInOut",
      }}
      className={cn(
        "bg-primary/5 rounded-md",
        className
      )}
      {...props}
    />
  )
}
