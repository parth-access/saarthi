import * as React from "react"
import { motion, AnimatePresence } from "motion/react"
import { format, addDays, isSameDay, startOfToday, parseISO } from "date-fns"
import { ChevronRight, ChevronLeft, Calendar, Clock, User, CheckCircle2, ChevronRightCircle, Loader2 } from "lucide-react"
import { Button } from "../ui/Button"
import { Input } from "../ui/Input"
import { Textarea } from "../ui/Textarea"
import { cn } from "../../lib/utils"
import { SessionType } from "../../types"

const SLOTS = [
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "01:00 PM",
  "04:00 PM",
  "05:00 PM",
  "06:00 PM",
  "07:00 PM"
]

const SESSION_TYPES: SessionType[] = ["Individual", "Couple", "Family", "Teen"]

interface BookingData {
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
  const [loadingAvailability, setLoadingAvailability] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [bookedSlots, setBookedSlots] = React.useState<string[]>([])
  const [bookingData, setBookingData] = React.useState<BookingData>({
    sessionType: "",
    date: "",
    time: "",
    name: "",
    email: "",
    gender: "",
    age: "",
    message: ""
  })

  const handleNext = () => setStep(s => s + 1)
  const handleBack = () => setStep(s => s - 1)

  const fetchAvailability = async (dateStr: string) => {
    setLoadingAvailability(true)
    try {
      const res = await fetch(`/api/get-availability?date=${dateStr}`)
      const data = await res.json()
      if (data.success) {
        setBookedSlots(data.bookedSlots)
      }
    } catch (err) {
      console.error("Failed to fetch availability", err)
    } finally {
      setLoadingAvailability(false)
    }
  }

  React.useEffect(() => {
    if (bookingData.date) {
      fetchAvailability(bookingData.date)
    }
  }, [bookingData.date])

  const submitBooking = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/create-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bookingData,
          age: parseInt(bookingData.age)
        })
      })
      const data = await res.json()
      if (data.success) {
        setStep(6) // Success step
      } else {
        alert(data.error || "Something went wrong")
      }
    } catch (err) {
      console.error(err)
      alert("Failed to connect to server")
    } finally {
      setSubmitting(false)
    }
  }

  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <div className="space-y-6">
            <h3 className="text-2xl font-serif text-primary text-center">Select Session Type</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {SESSION_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => {
                    setBookingData(d => ({ ...d, sessionType: type }))
                    handleNext()
                  }}
                  className={cn(
                    "p-6 rounded-2xl border-2 text-left transition-all hover:border-primary/30",
                    bookingData.sessionType === type 
                      ? "border-primary bg-primary/5 text-primary" 
                      : "border-muted bg-white text-muted-foreground"
                  )}
                >
                  <span className="text-lg font-medium">{type}</span>
                </button>
              ))}
            </div>
          </div>
        )
      case 2:
        return (
          <div className="space-y-6">
            <h3 className="text-2xl font-serif text-primary text-center">Choose a Date</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[...Array(14)].map((_, i) => {
                const day = addDays(startOfToday(), i)
                const dateStr = format(day, "yyyy-MM-dd")
                const isSelected = bookingData.date === dateStr
                return (
                  <button
                    key={dateStr}
                    onClick={() => setBookingData(d => ({ ...d, date: dateStr, time: "" }))}
                    className={cn(
                      "p-4 rounded-xl border flex flex-col items-center transition-all",
                      isSelected 
                        ? "bg-primary text-white border-primary shadow-lg scale-105" 
                        : "bg-white border-muted hover:border-primary/30"
                    )}
                  >
                    <span className="text-xs uppercase opacity-80">{format(day, "EEE")}</span>
                    <span className="text-xl font-bold">{format(day, "dd")}</span>
                    <span className="text-xs">{format(day, "MMM")}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={handleBack}><ChevronLeft className="mr-2 h-4 w-4" /> Back</Button>
              <Button disabled={!bookingData.date} onClick={handleNext}>Next <ChevronRight className="ml-2 h-4 w-4" /></Button>
            </div>
          </div>
        )
      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-2xl font-serif text-primary">Pick a Time</h3>
              <p className="text-muted-foreground text-sm flex items-center justify-center mt-1">
                <Calendar className="w-3 h-3 mr-1" /> {format(parseISO(bookingData.date), "MMMM dd, yyyy")}
              </p>
            </div>
            
            {loadingAvailability ? (
              <div className="py-12 flex flex-col items-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
                <p className="text-sm text-muted-foreground">Checking slots...</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {SLOTS.map(slot => {
                  const isBooked = bookedSlots.includes(slot)
                  const isSelected = bookingData.time === slot
                  return (
                    <button
                      key={slot}
                      disabled={isBooked}
                      onClick={() => setBookingData(d => ({ ...d, time: slot }))}
                      className={cn(
                        "p-4 rounded-xl border text-sm font-medium transition-all relative overflow-hidden",
                        isBooked ? "bg-muted/50 border-muted opacity-40 cursor-not-allowed" :
                        isSelected ? "bg-primary text-white border-primary shadow-md" : 
                        "bg-white border-muted hover:border-primary/30"
                      )}
                    >
                      {slot}
                      {isBooked && <span className="absolute inset-0 flex items-center justify-center opacity-10"><Clock className="w-8 h-8" /></span>}
                    </button>
                  )
                })}
              </div>
            )}
            
            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={handleBack}><ChevronLeft className="mr-2 h-4 w-4" /> Back</Button>
              <Button disabled={!bookingData.time} onClick={handleNext}>Next <ChevronRight className="ml-2 h-4 w-4" /></Button>
            </div>
          </div>
        )
      case 4:
        return (
          <div className="space-y-6">
            <h3 className="text-2xl font-serif text-primary text-center">Your Details</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Full Name</label>
                  <Input 
                    placeholder="Enter your name" 
                    value={bookingData.name}
                    onChange={e => setBookingData(d => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email Address</label>
                  <Input 
                    type="email" 
                    placeholder="name@email.com" 
                    value={bookingData.email}
                    onChange={e => setBookingData(d => ({ ...d, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Gender</label>
                  <select 
                    value={bookingData.gender}
                    onChange={e => setBookingData(d => ({ ...d, gender: e.target.value }))}
                    className="flex h-10 w-full rounded-md border border-muted bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Age</label>
                  <Input 
                    type="number" 
                    placeholder="Age" 
                    value={bookingData.age}
                    onChange={e => setBookingData(d => ({ ...d, age: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Briefly describe your concern</label>
                <Textarea 
                  placeholder="Tell us a little about what you'd like to discuss..." 
                  value={bookingData.message}
                  onChange={e => setBookingData(d => ({ ...d, message: e.target.value }))}
                  rows={4}
                />
              </div>
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={handleBack}><ChevronLeft className="mr-2 h-4 w-4" /> Back</Button>
              <Button 
                disabled={!bookingData.name || !bookingData.email || !bookingData.gender || !bookingData.age} 
                onClick={handleNext}
              >
                Review <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )
      case 5:
        return (
          <div className="space-y-8">
            <div className="text-center">
              <h3 className="text-2xl font-serif text-primary">Review Details</h3>
              <p className="text-muted-foreground text-sm">Please verify your session details</p>
            </div>
            
            <div className="bg-[#FFFBE7] border border-accent/20 rounded-[2rem] p-8 space-y-6">
              <div className="grid grid-cols-2 gap-y-4 text-sm">
                <span className="text-muted-foreground">Session Type</span>
                <span className="font-bold text-primary">{bookingData.sessionType}</span>
                
                <span className="text-muted-foreground">Date & Time</span>
                <span className="font-bold text-primary">{format(parseISO(bookingData.date), "dd MMM yyyy")} at {bookingData.time}</span>
                
                <span className="text-muted-foreground">Name</span>
                <span className="font-bold text-primary">{bookingData.name}</span>
                
                <span className="text-muted-foreground">Email</span>
                <span className="font-bold text-primary truncate">{bookingData.email}</span>
              </div>
              
              {bookingData.message && (
                <div className="pt-4 border-t border-accent/10">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Your Message</p>
                  <p className="text-sm italic">{bookingData.message}</p>
                </div>
              )}
            </div>
            
            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={handleBack}><ChevronLeft className="mr-2 h-4 w-4" /> Back</Button>
              <Button className="px-12" size="lg" disabled={submitting} onClick={submitBooking}>
                {submitting ? <Loader2 className="animate-spin h-5 w-5" /> : "Confirm Booking"}
              </Button>
            </div>
          </div>
        )
      case 6:
        return (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-12 space-y-6"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 text-primary mb-2">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-serif text-primary">Request Received</h2>
            <p className="text-lg text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Your session request has been received. This is a meaningful step forward.
            </p>
            <p className="text-sm text-muted-foreground">We'll confirm your session shortly via email.</p>
            <Button asChild variant="outline" className="mt-8 rounded-full px-8">
              <a href="/">Back to Home</a>
            </Button>
          </motion.div>
        )
      default:
        return null
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-12 px-6">
      <div className="mb-12">
        <div className="flex justify-between items-center relative mb-4">
          {[1,2,3,4,5].map(i => (
            <div 
              key={i} 
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold z-10 transition-all",
                step === i ? "bg-primary text-white scale-110 shadow-lg" : 
                step > i ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              {step > i ? <CheckCircle2 className="w-5 h-5" /> : i}
            </div>
          ))}
          <div className="absolute top-1/2 left-0 w-full h-[2px] bg-muted -translate-y-1/2">
            <div 
              className="h-full bg-primary/20 transition-all duration-500" 
              style={{ width: `${(Math.min(step - 1, 4) / 4) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-[2.5rem] shadow-xl shadow-primary/5 p-8 sm:p-12 border border-muted/50"
        >
          {renderStep()}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export default BookingSystem
