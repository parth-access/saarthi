"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";

/** Labelled input with a floating label and optional show/hide toggle, used on the auth pages. */
export interface FloatingInputProps {
  id?: string;
  name?: string;
  autoComplete?: string;
  icon: React.ElementType;
  label: string;
  type: string;
  required?: boolean;
  isPassword?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showPassword?: boolean;
  togglePassword?: () => void;
  helperText?: string;
}

export const FloatingInput = ({
  id,
  name,
  autoComplete,
  icon: Icon,
  label,
  type,
  required = false,
  isPassword = false,
  value,
  onChange,
  showPassword,
  togglePassword,
  helperText,
}: FloatingInputProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const isActive = isFocused || value.length > 0;
  const inputId = id || name || `input-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="space-y-1">
      <motion.div 
         initial={false}
         animate={{ 
            y: isFocused ? -2 : 0, 
            boxShadow: isFocused ? "0 4px 20px rgba(230, 165, 32, 0.08)" : "0 0px 0px rgba(0,0,0,0)"
         }}
         className={`relative rounded-2xl border transition-colors duration-300 ${isFocused ? 'border-accent bg-white' : 'border-primary/10 bg-primary/[0.02] hover:border-primary/20 hover:bg-primary/[0.04]'} flex overflow-hidden`}
      >
         <div className={`w-12 flex items-center justify-center shrink-0 transition-colors duration-300 ${isFocused ? 'text-accent' : 'text-primary/40'}`}>
            <Icon className="w-5 h-5" />
         </div>
         
         <div className="relative flex-1">
           <motion.label
             htmlFor={inputId}
             initial={false}
             animate={{
                y: isActive ? 8 : 16,
                scale: isActive ? 0.75 : 1,
                opacity: isActive ? 0.8 : 0.6
             }}
             className={`absolute left-0 top-0 text-sm font-medium origin-left pointer-events-none transition-colors duration-300 ${isFocused ? "text-accent" : "text-primary"}`}
           >
             {label}
           </motion.label>
    
           <input
             id={inputId}
             name={name}
             autoComplete={autoComplete}
             type={isPassword ? (showPassword ? "text" : "password") : type}
             value={value}
             onChange={onChange}
             onFocus={() => setIsFocused(true)}
             onBlur={() => setIsFocused(false)}
             required={required}
             className="w-full h-14 bg-transparent text-primary text-sm font-medium focus:outline-none pt-5 pb-1 pr-4"
           />
         </div>

         {isPassword && (
            <button 
               type="button"
               onClick={togglePassword}
               className="w-12 flex items-center justify-center shrink-0 text-primary/40 hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-r-2xl select-none"
               aria-label={showPassword ? "Hide password" : "Show password"}
            >
               <AnimatePresence mode="wait">
                 {showPassword ? (
                   <motion.div key="eye-off" initial={{ opacity: 0, scale: 0.5, rotate: -45 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.5, rotate: 45 }} transition={{ duration: 0.15 }}>
                      <EyeOff className="w-4 h-4" />
                   </motion.div>
                 ) : (
                   <motion.div key="eye" initial={{ opacity: 0, scale: 0.5, rotate: -45 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.5, rotate: 45 }} transition={{ duration: 0.15 }}>
                      <Eye className="w-4 h-4" />
                   </motion.div>
                 )}
               </AnimatePresence>
            </button>
         )}
      </motion.div>
      {helperText && (
        <p className="text-xs text-primary/50 pl-3 pt-0.5">{helperText}</p>
      )}
    </div>
  );
};
