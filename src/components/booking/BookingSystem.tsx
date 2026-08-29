"use client";

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, Loader2, Mail } from "lucide-react"
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
import { ReviewStep, BookingFlowState } from "./steps/ReviewStep"

// Hooks
import { useTherapists } from "../../hooks/useTherapists"
import { useBooking } from "../../hooks/useBooking"
import { useAuth } from "../../contexts/AuthContext"
import { bookingService } from "../../services/bookingService"
import { paymentService } from "../../services/paymentService"
import { trackEvent } from "@/lib/analytics"

import { BookingFormData } from "../../core/validations/booking.schema"

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
  consent?: boolean;
}

const loadRazorpay = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve(true);

    const existing = document.getElementById('razorpay-script') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'razorpay-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

const BookingSystem = () => {
  const [step, setStep] = React.useState(1)
  const [bookingFlowState, setBookingFlowState] = React.useState<BookingFlowState>('IDLE')
  const isProcessingRef = React.useRef<boolean>(false)
  const isVerifyingRef = React.useRef<boolean>(false)
  const hasTrackedStartedRef = React.useRef(false)
  const hasTrackedSubmittedRef = React.useRef(false)
  const lockTimerRef = React.useRef<NodeJS.Timeout | null>(null)

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
  const { currentUser } = useAuth()
  const isAuthenticated = Boolean(currentUser)
  const { createBooking, lockSlot, submitting, error: submitError, setError: setSubmitError } = useBooking()

  // Clean up any pending setTimeout on unmount
  React.useEffect(() => {
    return () => {
      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current);
      }
    };
  }, []);

  const releaseCurrentLock = React.useCallback(() => {
    if (activeLockId && bookingData.therapistId && bookingData.date && bookingData.time) {
      bookingService.releaseLock(bookingData.therapistId, bookingData.date, bookingData.time, activeLockId);
    }
    setActiveLockId(null);
  }, [activeLockId, bookingData.therapistId, bookingData.date, bookingData.time]);

  const trackBookingStarted = React.useCallback((context?: Record<string, unknown>) => {
    if (!hasTrackedStartedRef.current) {
      hasTrackedStartedRef.current = true;
      trackEvent('booking_flow_started', context);
    }
  }, []);

  const handleNext = () => setStep(s => s + 1)
  
  const handleBack = () => {
    setSubmitError(null)
    // If stepping back out of slot or details, release the pending slot lock to prevent abandoned holds
    if (step === 5 || step === 4) {
      releaseCurrentLock()
      setBookingData(prev => ({ ...prev, time: "" }))
    }
    setStep(s => s - 1)
  }

  const handleTherapistSelect = (id: string) => {
    trackBookingStarted({ step: 1 })
    if (bookingData.therapistId !== id) {
      releaseCurrentLock()
    }
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
    releaseCurrentLock()
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
      
      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current);
      }
      lockTimerRef.current = setTimeout(() => {
        handleNext()
        setLockingTime(null)
      }, 300)
    } else {
      setLockingTime(null)
      setSubmitError((result as { data?: { lockId?: string }, lockId?: string, error?: string }).error || "Slot is no longer available")
    }
  }

  const handleDetailsSubmit = (details: BookingFormData) => {
    trackBookingStarted({ step: 5 })
    setBookingData(prev => ({ ...prev, ...details }))
    handleNext()
  }

  const handleConfirm = async () => {
    // Synchronous mutex guard: reject any duplicate calls immediately
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setBookingFlowState('SUBMITTING_BOOKING');
    setSubmitError(null);

    try {
      const isScriptLoaded = await loadRazorpay();
      if (!isScriptLoaded || typeof window === 'undefined' || !(window as unknown as { Razorpay?: unknown }).Razorpay) {
        isProcessingRef.current = false;
        setBookingFlowState('ERROR');
        setSubmitError('Unable to load payment gateway. Please check your internet connection and click to try again.');
        return;
      }

      const result = await createBooking({
        ...bookingData,
        lockId: activeLockId || undefined,
        age: parseInt(bookingData.age, 10) || 25
      });

      if (!result.success || !result.data?.orderId) {
        isProcessingRef.current = false;
        setBookingFlowState('ERROR');
        setSubmitError(result.error || 'Failed to initiate booking order.');
        return;
      }

      setBookingFlowState('PAYMENT_OPEN');

      const selectedTherapistName = therapists.find(t => t.id === bookingData.therapistId)?.name ?? 'Saarthi Specialist';

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
        currency: result.data.currency || 'INR',
        name: 'Saarthi',
        description: `Therapy Session with ${selectedTherapistName}`,
        image: '/favicon.ico',
        order_id: result.data.orderId,
        handler: async function (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string; }) {
          if (isVerifyingRef.current) return;
          isVerifyingRef.current = true;
          setBookingFlowState('VERIFYING_PAYMENT');

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
                trackEvent('booking_confirmed', {
                  session_type: bookingData.sessionType,
                  date_selected: bookingData.date,
                });
              }
              setBookingFlowState('CONFIRMED');
              setStep(7);
            } else {
              throw new Error('Payment verification failed');
            }
          } catch (err) {
            isProcessingRef.current = false;
            isVerifyingRef.current = false;
            setBookingFlowState('ERROR');
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
            if (!isVerifyingRef.current) {
              paymentService.reportPaymentFailure({
                bookingId: result.data.bookingId,
                orderId: result.data.orderId,
                reason: 'Payment dismissed by user'
              });
              isProcessingRef.current = false;
              setBookingFlowState('ERROR');
              setSubmitError('Payment was not completed. Your slot hold will expire shortly.');
            }
          }
        }
      };

      const rzp = new (window as unknown as { Razorpay: new (opts: Record<string, unknown>) => { on: (evt: string, cb: (response: RazorpayFailResponse) => void) => void, open: () => void } }).Razorpay(rzpOptions);
      rzp.on('payment.failed', function (response: RazorpayFailResponse) {
        if (!isVerifyingRef.current) {
          const failReason = response?.error?.description || response?.error?.reason || 'Payment failed';
          paymentService.reportPaymentFailure({
            bookingId: result.data.bookingId,
            orderId: result.data.orderId,
            reason: failReason
          });
          isProcessingRef.current = false;
          setBookingFlowState('ERROR');
          setSubmitError(`Payment Failed: ${failReason}. If any money was debited, it will be refunded within 5-7 business days.`);
        }
      });
      rzp.open();
    } catch (err) {
      isProcessingRef.current = false;
      setBookingFlowState('ERROR');
      setSubmitError((err instanceof Error ? err.message : String(err)) || 'An unexpected error occurred.');
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
        return <DetailsStep initialData={bookingData} sessionType={bookingData.sessionType} onNext={handleDetailsSubmit} onBack={handleBack} />
      case 6:
        return (
          <ReviewStep 
            data={bookingData} 
            therapists={therapists} 
            onConfirm={handleConfirm} 
            onBack={handleBack}
            onJumpToSlots={() => setStep(4)}
            submitting={submitting}
            bookingFlowState={bookingFlowState}
            error={submitError}
          />
        )
      case 7:
        return (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16 px-4 space-y-8 max-w-lg mx-auto">
            <div className="relative inline-flex items-center justify-center">
              <div className="absolute inset-0 bg-primary/10 rounded-full scale-[1.8] animate-pulse" />
              <div className="relative w-24 h-24 rounded-full bg-primary text-white flex items-center justify-center shadow-2xl shadow-primary/30">
                <CheckCircle2 className="w-12 h-12" />
              </div>
            </div>
            
            <div className="space-y-4">
              <h2 className="text-4xl font-serif text-primary">Booking Confirmed</h2>
              <p className="text-lg text-muted-foreground italic font-serif">“Every journey begins with a single, intentional step.”</p>
              
              {isAuthenticated ? (
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Your payment was successful and your session is confirmed. We have sent the confirmation to <span className="font-semibold text-primary">{bookingData.email}</span>.
                </p>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10 text-left flex items-start gap-3.5">
                    <Mail className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs text-primary/80">
                      <p className="font-bold text-primary text-sm">Session Confirmation Sent</p>
                      <p className="leading-relaxed">
                        We have emailed your calendar invitation, video session link, and receipt to <span className="font-semibold text-primary underline">{bookingData.email}</span>.
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Need to reschedule or view booking details? You can use the secure management link sent to your email anytime.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2">
              {isAuthenticated ? (
                <Button asChild variant="outline" className="h-14 rounded-full px-12 border-2 hover:bg-primary hover:text-white transition-all duration-500 shadow-sm">
                  <NextLink href="/dashboard">Go to Dashboard</NextLink>
                </Button>
              ) : (
                <Button asChild variant="outline" className="h-14 rounded-full px-12 border-2 hover:bg-primary hover:text-white transition-all duration-500 shadow-sm">
                  <NextLink href="/">Return to Home</NextLink>
                </Button>
              )}
            </div>
          </motion.div>
        )
      default:
        return null
    }
  }

  React.useEffect(() => {
    if (step === 7 && !hasTrackedSubmittedRef.current) {
      hasTrackedSubmittedRef.current = true;
      trackEvent('booking_confirmed', {
        session_type: bookingData.sessionType,
        date_selected: bookingData.date,
      });
    }
  }, [step, bookingData.sessionType, bookingData.date]);

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

      {bookingFlowState === 'VERIFYING_PAYMENT' && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <h3 className="text-2xl font-serif font-bold text-primary">Confirming Your Booking</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Payment received! Confirming your appointment reservation and generating your session details. Please do not refresh or close this window...
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default BookingSystem

