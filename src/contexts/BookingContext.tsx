"use client";


import * as React from "react"
import { useForm, UseFormReturn } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"

// Booking Architecture State
export const bookingSchema = z.object({
  therapistId: z.string().min(1, "Therapist is required"),
  sessionType: z.string().min(1, "Session type is required"),
  date: z.string().min(1, "Date is required"),
  time: z.string().min(1, "Time is required"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Valid phone number is required"),
  gender: z.string().optional(),
  age: z.string().optional(),
  message: z.string().optional(),
})

export type BookingFormData = z.infer<typeof bookingSchema>

interface BookingContextType {
  form: UseFormReturn<BookingFormData>;
  step: number;
  setStep: React.Dispatch<React.SetStateAction<number>>;
  activeLockId: string | null;
  setActiveLockId: React.Dispatch<React.SetStateAction<string | null>>;
  lockingTime: string | null;
  setLockingTime: React.Dispatch<React.SetStateAction<string | null>>;
}

const BookingContext = React.createContext<BookingContextType | undefined>(undefined)

export const BookingProvider = ({ children }: { children: React.ReactNode }) => {
  const [step, setStep] = React.useState(1)
  const [activeLockId, setActiveLockId] = React.useState<string | null>(null)
  const [lockingTime, setLockingTime] = React.useState<string | null>(null)

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      therapistId: "",
      sessionType: "",
      date: "",
      time: "",
      name: "",
      email: "",
      phone: "",
      gender: "",
      age: "",
      message: ""
    },
    mode: "onChange"
  })

  return (
    <BookingContext.Provider value={{
      form,
      step,
      setStep,
      activeLockId,
      setActiveLockId,
      lockingTime,
      setLockingTime
    }}>
      {children}
    </BookingContext.Provider>
  )
}

export const useBookingContext = () => {
  const context = React.useContext(BookingContext)
  if (context === undefined) {
    throw new Error("useBookingContext must be used within a BookingProvider")
  }
  return context
}
