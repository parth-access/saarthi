import * as React from "react"
import { motion, HTMLMotionProps } from "framer-motion"
import { cn } from "../../lib/utils"
import { DashboardCard, theme } from "./DashboardCard"
import { ArrowUpRight, ArrowDownRight, LucideIcon } from "lucide-react"

interface StatCardProps extends HTMLMotionProps<"div"> {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function StatCard({ title, value, icon: Icon, trend, className, ...props }: StatCardProps) {
  return (
    <DashboardCard className={cn("flex flex-col", className)} {...props}>
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center text-accent">
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full",
            trend.isPositive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
          )}>
            {trend.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend.value}%
          </div>
        )}
      </div>
      <h3 className="text-3xl font-serif text-primary font-semibold mb-1">{value}</h3>
      <p className="text-sm font-medium text-primary/60">{title}</p>
    </DashboardCard>
  )
}
