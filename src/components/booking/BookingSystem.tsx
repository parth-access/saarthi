"use client";

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2 } from "lucide-react"
import NextLink from "next/link"
import { Button } from "../ui/Button"
import { cn } from "../../lib/utils"
import { SessionType } from "../../types"

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
import { paymentService } from "../../services/paymentService"
import { trackEvent } from "@/lib/analytics"

interface BookingState {
  therapistId: string;
  sessionType: SessionType | "";
  date: string;
  time: string;
  name: string;
  email: string;
  phone: string;
  gender: string;
  age: string;
  message: string;
}

const BookingSystem = () => {
  const [step, setStep] = React.useState(1)
  const hasTrackedStartedRef = React.useRef(false)
  const hasTrackedSubmittedRef = React.useRef(false)
  const [bookingData, setBookingData] = React.useState<BookingState>({
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
  })
  const [activeLockId, setActiveLockId] = React.useState<string | null>(null)
  const [lockingTime, setLockingTime] = React.useState<string | null>(null)
  
  const { therapists } = useTherapists()
  const { createBooking, lockSlot, submitting, error: submitError, setError: setSubmitError } = useBooking()

  const trackBookingStarted = React.useCallback((context?: Record<string, unknown>) => {
    if (!hasTrackedStartedRef.current) {
      hasTrackedStartedRef.current = true;
      trackEvent('book_demo_started', context);
    }
  }, []);

  const handleNext = () => setStep(s => s + 1)
  const handleBack = () => {
    setSubmitError(null)
    setStep(s => s - 1)
  }

  const handleTherapistSelect = (id: string) => {
    trackBookingStarted({ step: 1 })
    setBookingData(prev => ({ ...prev, therapistId: id }))
    handleNext()
  }

  const handleSessionTypeSelect = (type: SessionType) => {
    trackBookingStarted({ step: 2, session_type: type })
    setBookingData(prev => ({ ...prev, sessionType: type }))
    handleNext()
  }

  const handleDateSelect = (date: string) => {
    trackBookingStarted({ step: 3 })
    setBookingData(prev => ({ ...prev, date, time: "" }))
  }

  const handleSlotSelect = async (time: string) => {
    trackBookingStarted({ step: 4 })
    setLockingTime(time)
    setSubmitError(null)
    
    const result = await lockSlot({
      therapistId: bookingData.therapistId,
      date: bookingData.date,
      time
    })

    if (result.success) {
      setBookingData(prev => ({ ...prev, time }))
      setActiveLockId((result as { data?: { lockId?: string }, lockId?: string, error?: string }).data?.lockId || (result as { data?: { lockId?: string }, lockId?: string, error?: string }).lockId || null)
      setTimeout(() => {
        handleNext()
        setLockingTime(null)
      }, 300)
    } else {
      setLockingTime(null)
      setSubmitError((result as { data?: { lockId?: string }, lockId?: string, error?: string }).error || "Slot is no longer available")
    }
  }

  const handleDetailsSubmit = (details: { name: string; email: string; phone: string; gender: string; age: string; message?: string }) => {
    trackBookingStarted({ step: 5 })
    setBookingData(prev => ({ ...prev, ...details }))
    handleNext()
  }

  const handleConfirm = async () => {
    const result = await createBooking({
      ...bookingData,
      lockId: activeLockId || undefined,
      age: parseInt(bookingData.age)
    })

    if (result.success && result.data?.orderId) {
      if (typeof window === 'undefined' || !(window as unknown as { Razorpay: new (opts: Record<string, unknown>) => { on: (evt: string, cb: (...args: unknown[]) => void) => void, open: () => void } }).Razorpay) {
        setSubmitError('Razorpay SDK failed to load. Are you online?');
        return;
      }

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
        amount: result.data.amount * 100,
        currency: result.data.currency,
        name: 'Saarthi',
        description: `Session with Therapist ${bookingData.therapistId}`,
        image: '/favicon.ico',
        order_id: result.data.orderId,
        handler: async function (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string; }) {
           try {
             const verifyRes = await paymentService.verifyPayment({
               bookingId: result.data.bookingId,
               razorpay_payment_id: response.razorpay_payment_id,
               razorpay_order_id: response.razorpay_order_id,
               razorpay_signature: response.razorpay_signature
             });
             if (verifyRes.success) {
               if (!hasTrackedSubmittedRef.current) {
                 hasTrackedSubmittedRef.current = true;
                 trackEvent('book_demo_submitted', {
                   session_type: bookingData.sessionType,
                   date_selected: bookingData.date,
                 });
               }
               setStep(7);
             } else {
               throw new Error('Payment verification failed');
             }
           } catch (err) {
             setSubmitError((err instanceof Error ? err.message : String(err)) || 'Payment verification failed. Please contact support.');
           }
        },
        prefill: {
            name: bookingData.name,
            email: bookingData.email,
            contact: bookingData.phone || '',
        },
        theme: {
            color: '#E6A520'
        }
      };

      interface RazorpayFailResponse {
        error?: {
          description?: string;
          reason?: string;
        };
      }

      const rzpOptions = {
        ...options,
        modal: {
          ondismiss: function () {
            paymentService.reportPaymentFailure({
              bookingId: result.data.bookingId,
              orderId: result.data.orderId,
              reason: 'Payment dismissed by user'
            });
            setSubmitError('Payment was not completed. Your slot hold has been released.');
          }
        }
      };

      const rzp = new (window as unknown as { Razorpay: new (opts: Record<string, unknown>) => { on: (evt: string, cb: (response: RazorpayFailResponse) => void) => void, open: () => void } }).Razorpay(rzpOptions);
      rzp.on('payment.failed', function (response: RazorpayFailResponse) {
          const failReason = response?.error?.description || response?.error?.reason || 'Payment failed';
          paymentService.reportPaymentFailure({
            bookingId: result.data.bookingId,
            orderId: result.data.orderId,
            reason: failReason
          });
          setSubmitError(`Payment Failed: ${failReason}. If any money was debited, it will be refunded within 5-7 business days.`);
      });
      rzp.open();
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
              <h2 className="text-4xl font-serif text-primary">Booking Confirmed</h2>
              <p className="text-xl text-muted-foreground leading-relaxed italic">“Every journey begins with a single, intentional step.”</p>
              <p className="text-muted-foreground">Your payment was successful and your session is confirmed. We will send you an email shortly.</p>
            </div>

            <Button asChild variant="outline" className="h-14 rounded-full px-12 border-2 hover:bg-primary hover:text-white transition-all duration-500">
              <NextLink href="/dashboard">Go to Dashboard</NextLink>
            </Button>
          </motion.div>
        )
      default:
        return null
    }
  }

  React.useEffect(() => {
    if (step === 7 && !hasTrackedSubmittedRef.current) {
      hasTrackedSubmittedRef.current = true;
      trackEvent('book_demo_submitted', {
        session_type: bookingData.sessionType,
        date_selected: bookingData.date,
      });
    }
  }, [step, bookingData.sessionType, bookingData.date]);

  React.useEffect(() => {
    // Load Razorpay Script
    if (!document.getElementById('razorpay-script')) {
      const script = document.createElement('script');
      script.id = 'razorpay-script';
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

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
