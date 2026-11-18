import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[14px] text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] motion-reduce:transition-colors motion-reduce:active:scale-100",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-[0_8px_20px_-12px_rgba(19,59,41,0.55)] hover:bg-primary-deep hover:shadow-[0_12px_24px_-12px_rgba(19,59,41,0.6)] hover:-translate-y-px motion-reduce:hover:translate-y-0",
        outline:
          "border border-muted bg-surface text-primary hover:border-primary/35 hover:-translate-y-px motion-reduce:hover:translate-y-0",
        accent:
          "bg-accent text-accent-foreground shadow-[0_8px_20px_-12px_rgba(142,106,53,0.5)] hover:bg-accent/90 hover:-translate-y-px motion-reduce:hover:translate-y-0",
        destructive:
          "bg-danger-surface text-danger border border-danger/15 hover:bg-danger/10 hover:-translate-y-px motion-reduce:hover:translate-y-0",
        ghost: "text-primary hover:bg-sage",
        link: "text-primary underline-offset-[6px] decoration-accent/60 hover:underline",
      },
      size: {
        default: "h-12 px-7 py-2",
        sm: "h-9 px-4 text-xs",
        lg: "h-14 px-9 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
