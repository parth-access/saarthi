import * as React from "react"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className = "", ...props }, ref) => {
  return (
    <textarea
      className={`flex min-h-[120px] w-full rounded-2xl border border-primary/20 bg-white/50 px-4 py-3 text-sm transition-all duration-200 placeholder:text-primary/30 focus-visible:outline-none focus-visible:border-[#E6A520] focus-visible:ring-4 focus-visible:ring-[#E6A520]/10 disabled:cursor-not-allowed disabled:opacity-50 hover:border-primary/30 resize-y leading-relaxed ${className}`}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
