import * as React from "react"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className = "", type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={`flex h-12 w-full rounded-2xl border border-primary/20 bg-white/50 px-4 py-2 text-sm transition-all duration-200 placeholder:text-primary/30 focus-visible:outline-none focus-visible:border-[#E6A520] focus-visible:ring-4 focus-visible:ring-[#E6A520]/10 disabled:cursor-not-allowed disabled:opacity-50 hover:border-primary/30 ${className}`}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = "Input"

export { Input }
