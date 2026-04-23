import * as React from "react"
import { motion, AnimatePresence } from "motion/react"
import { CheckCircle2, Link } from "lucide-react"
import { Button } from "../ui/Button"
import { cn } from "../../lib/utils"
import { SessionType, Therapist } from "../../types"

// Step Components
import { TherapistStep } from "./steps/TherapistStep"
import { SessionTypeStep } from "./steps/SessionTypeStep"
import { DateStep } from "./steps/DateStep"
import { SlotStep } from "./steps/SlotStep"
import { DetailsStep } from "./steps/DetailsStep"
import { ReviewStep } from "./steps/ReviewStep"

// Hooks
import { useTherapists } from "../../hooks/useTherapists"
import { useBooking } from "../../hooks/useBooking"

interface BookingState {
  therapistId: string;
  sessionType: SessionType | "";
  date: string;
  time: string;
  name: string;
  email: string;
  gender: string;
  age: string;
  message: string;
}

const BookingSystem = () => {
  const [step, setStep] = React.useState(1)
  const [bookingData, setBookingData] = React.useState<BookingState>({
    therapistId: "",
    sessionType: "",
    date: "",
    time: "",
    name: "",
    email: "",
    gender: "",
    age: "",
    message: ""
  })
  const [activeLockId, setActiveLockId] = React.useState<string | null>(null)
  const [lockingTime, setLockingTime] = React.useState<string | null>(null)

  const { therapists } = useTherapists()
  const { createBooking, lockSlot, submitting, error: submitError, setError: setSubmitError } = useBooking()

  const handleNext = () => setStep(s => s + 1)
  const handleBack = () => {
    setSubmitError(null)
    setStep(s => s - 1)
  }

  const handleTherapistSelect = (id: string) => {
    setBookingData(prev => ({ ...prev, therapistId: id }))
    handleNext()
  }

  const handleSessionTypeSelect = (type: SessionType) => {
    setBookingData(prev => ({ ...prev, sessionType: type }))
    handleNext()
  }

  const handleDateSelect = (date: string) => {
    setBookingData(prev => ({ ...prev, date, time: "" }))
  }

  const handleSlotSelect = async (time: string) => {
    setLockingTime(time)
    setSubmitError(null)
    
    const result = await lockSlot({
      therapistId: bookingData.therapistId,
      date: bookingData.date,
      time
    })

    if (result.success) {
      setBookingData(prev => ({ ...prev, time }))
      setActiveLockId(result.lockId)
      setTimeout(() => {
        handleNext()
        setLockingTime(null)
      }, 300)
    } else {
      setLockingTime(null)
      setSubmitError(result.error || "Slot is no longer available")
    }
  }

  const handleDetailsSubmit = (details: any) => {
    setBookingData(prev => ({ ...prev, ...details }))
    handleNext()
  }

  const handleConfirm = async () => {
    const result = await createBooking({
      ...bookingData,
      lockId: activeLockId,
      age: parseInt(bookingData.age)
    })
    if (result.success) {
      setStep(7)
    }
  }

  const renderCurrentStep = () => {
    switch (step) {
      case 1:
        return <TherapistStep selectedId={bookingData.therapistId} onSelect={handleTherapistSelect} />
      case 2:
        return <SessionTypeStep selected={bookingData.sessionType} onSelect={handleSessionTypeSelect} onBack={handleBack} />
      case 3:
        return <DateStep selectedDate={bookingData.date} onSelect={handleDateSelect} onNext={handleNext} onBack={handleBack} />
      case 4:
        return (
          <SlotStep 
            therapistId={bookingData.therapistId} 
            date={bookingData.date} 
            onSelect={handleSlotSelect} 
            onBack={handleBack}
            lockingTime={lockingTime}
          />
        )
      case 5:
        return <DetailsStep initialData={bookingData} onNext={handleDetailsSubmit} onBack={handleBack} />
      case 6:
        return (
          <ReviewStep 
            data={bookingData} 
            therapists={therapists} 
            onConfirm={handleConfirm} 
            onBack={handleBack}
            submitting={submitting}
            error={submitError}
          />
        )
      case 7:
        return (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20 px-4 space-y-10">
            <div className="relative inline-flex items-center justify-center">
              <div className="absolute inset-0 bg-primary/10 rounded-full scale-[1.8] animate-pulse" />
              <div className="relative w-24 h-24 rounded-full bg-primary text-white flex items-center justify-center shadow-2xl shadow-primary/30">
                <CheckCircle2 className="w-12 h-12" />
              </div>
            </div>
            <div className="space-y-4 max-w-sm mx-auto">
              <h2 className="text-4xl font-serif text-primary">A Path Forward</h2>
              <p className="text-xl text-muted-foreground leading-relaxed italic">“Every journey begins with a single, intentional step.”</p>
              <p className="text-muted-foreground">Your request has been sent. We will confirm via email within 24 hours.</p>
            </div>
            <Button asChild variant="outline" className="h-14 rounded-full px-12 border-2 hover:bg-primary hover:text-white transition-all duration-500">
              <a href="/">Return to Home</a>
            </Button>
          </motion.div>
        )
      default:
        return null
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-12 px-6 overflow-hidden min-h-[700px]">
      {step < 7 && (
        <div className="mb-16">
          <div className="flex justify-between items-center relative mb-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className={cn("w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black z-10 transition-all duration-500", step === i ? "bg-primary text-white scale-125 shadow-lg shadow-primary/20" : step > i ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground opacity-40")}>
                {step > i ? <CheckCircle2 className="w-4 h-4" /> : i}
              </div>
            ))}
            <div className="absolute top-1/2 left-0 w-full h-[1px] bg-muted -translate-y-1/2">
              <div className="h-full bg-primary/30 transition-all duration-700 ease-out" style={{ width: `${(Math.min(step - 1, 5) / 5) * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          {renderCurrentStep()}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export default BookingSystem
