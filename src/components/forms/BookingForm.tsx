import * as React from "react"
import { motion, AnimatePresence } from "motion/react"
import { format, addDays, startOfToday, parseISO } from "date-fns"
import { 
  ChevronRight, 
  ChevronLeft, 
  Calendar, 
  Clock, 
  User, 
  CheckCircle2, 
  Loader2, 
  ShieldCheck, 
  AlertCircle 
} from "lucide-react"
import { Button } from "../ui/Button"
import { Link } from "react-router-dom"
import { Input } from "../ui/Input"
import { Textarea } from "../ui/Textarea"
import { cn } from "../../lib/utils"
import { SessionType, Therapist, BookingStatus } from "../../types"

const SESSION_TYPES: SessionType[] = ["Individual", "Couple", "Family", "Teen"]

interface BookingData {
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

interface Slot {
  time: string;
  isAvailable: boolean;
  reason: string | null;
}

const BookingSystem = () => {
  const [step, setStep] = React.useState(1)
  const [therapists, setTherapists] = React.useState<Therapist[]>([])
  const [loadingTherapists, setLoadingTherapists] = React.useState(true)
  const [loadingSlots, setLoadingSlots] = React.useState(false)
  const [slots, setSlots] = React.useState<Slot[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  
  const [bookingData, setBookingData] = React.useState<BookingData>({
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

  const handleNext = () => setStep(s => s + 1)
  const handleBack = () => {
    setError(null)
    setStep(s => s - 1)
  }

  // Safe fetch helper to handle non-JSON responses (HTML hijacking)
  const safeFetch = async (url: string, options?: RequestInit) => {
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type");
    
    if (!contentType || !contentType.includes("application/json")) {
      const text = await res.text();
      console.error(`❌ Non-JSON response from ${url}:`, text.slice(0, 200));
      throw new Error(`Server returned unexpected format. Expected JSON, got ${contentType || 'unknown'}.`);
    }
    
    return res.json();
  };

  // 1. Fetch Therapists
  React.useEffect(() => {
    const fetchTherapists = async () => {
      console.log('🔄 BookingSystem: Fetching therapists...');
      setLoadingTherapists(true)
      setError(null)
      try {
        const data = await safeFetch('/api/get-therapists')
        console.log('📦 BookingSystem: Therapist data received', data);
        if (data.success) {
          setTherapists(data.therapists || [])
        } else {
          setError(data.error || "Could not load our specialists.")
        }
      } catch (err: any) {
        console.error("❌ BookingSystem: Failed to fetch therapists", err)
        setError(err.message || "Network error. Please check your connection.")
      } finally {
        setLoadingTherapists(false)
      }
    }
    fetchTherapists()
  }, [])

  // 2. Fetch Availability Slots
  const fetchAvailability = async (therapistId: string, date: string) => {
    if (!therapistId || !date) return
    setLoadingSlots(true)
    setError(null)
    console.log(`🔄 BookingSystem: Fetching availability for ${therapistId} on ${date}`);
    try {
      const data = await safeFetch(`/api/get-availability?therapistId=${therapistId}&date=${date}`)
      
      if (data.success) {
        console.log(`📦 BookingSystem: Slots received`, data.slots);
        setSlots(data.slots || [])
      } else {
        console.error(`❌ BookingSystem: API error`, data.error);
        setError(data.error || "Unable to load slots. Please try again.")
      }
    } catch (err: any) {
      console.error("❌ BookingSystem: Network fetch error", err)
      setError(err.message || "Unable to connect to the availability service.")
    } finally {
      setLoadingSlots(false)
    }
  }

  React.useEffect(() => {
    if (bookingData.therapistId && bookingData.date && step === 4) {
      fetchAvailability(bookingData.therapistId, bookingData.date)
    }
  }, [bookingData.therapistId, bookingData.date, step])

  // 3. Lock Slot
  const lockSlot = async (time: string) => {
    setError(null)
    try {
      const res = await fetch('/api/lock-slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          therapistId: bookingData.therapistId,
          date: bookingData.date,
          time: time
        })
      })
      const data = await res.json()
      if (data.success) {
        setBookingData(prev => ({ ...prev, time }))
        handleNext()
      } else {
        setError(data.error || "This slot is no longer available.")
        // Refresh availability if lock fails
        fetchAvailability(bookingData.therapistId, bookingData.date)
      }
    } catch (err) {
      setError("Connection issue while trying to reserve slot.")
    }
  }

  // 4. Create Booking
  const submitBooking = async () => {
    setSubmitting(true)
    setError(null)
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
        setStep(7) // Success step
      } else {
        setError(data.error || "Final confirmation failed. Please try again.")
      }
    } catch (err) {
      setError("Unable to complete booking. Check your connection.")
    } finally {
      setSubmitting(false)
    }
  }

  const formatTime12h = (time24: string) => {
    try {
      const [hours, minutes] = time24.split(':').map(Number)
      const period = hours >= 12 ? 'PM' : 'AM'
      const h12 = hours % 12 || 12
      return `${h12}:${minutes.toString().padStart(2, '0')} ${period}`
    } catch (e) {
      return time24
    }
  }

  const renderStep = () => {
    switch(step) {
      case 1: // Therapist Selection
        return (
          <div className="space-y-8">
            <div className="text-center">
              <h3 className="text-3xl font-serif text-primary">Choose your Therapist</h3>
              <p className="text-muted-foreground mt-2">Select a specialist best suited for your journey</p>
            </div>
            
            {loadingTherapists ? (
              <div className="py-20 flex flex-col items-center">
                <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                <p className="font-serif italic text-primary/60">Meeting our team...</p>
              </div>
            ) : error && step === 1 ? (
              <div className="py-16 text-center space-y-4">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto opacity-50" />
                <p className="text-primary font-medium">{error}</p>
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Try Again
                </Button>
              </div>
            ) : therapists.length === 0 ? (
              <div className="py-16 text-center space-y-6 bg-primary/5 rounded-[2.5rem] border-2 border-dashed border-primary/10">
                <ShieldCheck className="w-12 h-12 text-primary/20 mx-auto" />
                <div className="space-y-2">
                  <p className="text-xl font-serif text-primary/60">No specialists available right now.</p>
                  <p className="text-sm text-muted-foreground">We are currently updating our therapist profiles.</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-6">
                {therapists.map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      console.log(`👤 BookingSystem: Therapist selected: ${t.name} (${t.id})`);
                      setBookingData(d => ({ ...d, therapistId: t.id }))
                      handleNext()
                    }}
                    className={cn(
                      "p-6 rounded-[2.5rem] border-2 text-left transition-all group flex flex-col sm:flex-row items-center gap-6",
                      bookingData.therapistId === t.id 
                        ? "border-primary bg-primary/5 ring-4 ring-primary/5" 
                        : "border-muted/30 bg-white hover:border-primary/20 hover:bg-primary/5"
                    )}
                  >
                    <div className="w-24 h-24 rounded-full overflow-hidden shrink-0 border-2 border-primary/10">
                      <img 
                        src={t.image || "placeholder.png"} 
                        alt={t.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                      />
                    </div>
                    <div className="flex-1 space-y-2 text-center sm:text-left">
                      <h4 className="text-xl font-serif text-primary font-bold">{t.name}</h4>
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                        <p className="text-sm font-medium text-accent uppercase tracking-wider">{t.specialization}</p>
                        <span className="w-1.5 h-1.5 rounded-full bg-accent/30 hidden sm:block" />
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{t.experience} Exp.</p>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {t.bio}
                      </p>
                    </div>
                    <ChevronRight className="hidden sm:block w-6 h-6 text-primary/40 group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      case 2: // Session Type
        return (
          <div className="space-y-8">
            <div className="text-center">
              <h3 className="text-3xl font-serif text-primary">Session Type</h3>
              <p className="text-muted-foreground mt-2">What kind of support are you looking for?</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {SESSION_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => {
                    setBookingData(d => ({ ...d, sessionType: type }))
                    handleNext()
                  }}
                  className={cn(
                    "p-8 rounded-[2rem] border-2 text-center transition-all hover:scale-[1.02] active:scale-100",
                    bookingData.sessionType === type 
                      ? "border-primary bg-primary/5 text-primary ring-4 ring-primary/5 shadow-xl shadow-primary/5" 
                      : "border-muted/30 bg-white text-muted-foreground"
                  )}
                >
                  <span className="text-xl font-serif font-bold">{type}</span>
                </button>
              ))}
            </div>
            <div className="flex pt-4">
              <Button variant="ghost" className="rounded-full" onClick={handleBack}>
                <ChevronLeft className="mr-2 h-4 w-4" /> Go Back
              </Button>
            </div>
          </div>
        )
      case 3: // Date Selection
        return (
          <div className="space-y-8">
            <div className="text-center">
              <h3 className="text-3xl font-serif text-primary">Preferred Date</h3>
              <p className="text-muted-foreground mt-2">Choose a day that works for you</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[...Array(14)].map((_, i) => {
                const day = addDays(startOfToday(), i)
                // Skip Sundays if not available or just disable if rule says so
                // For simplicity, showing all 14 days
                const dateStr = format(day, "yyyy-MM-dd")
                const isSelected = bookingData.date === dateStr
                return (
                  <button
                    key={dateStr}
                    onClick={() => setBookingData(d => ({ ...d, date: dateStr, time: "" }))}
                    className={cn(
                      "p-6 rounded-2xl border-2 flex flex-col items-center transition-all hover:border-primary/40",
                      isSelected 
                        ? "bg-primary text-white border-primary shadow-xl scale-105" 
                        : "bg-white border-muted/30 hover:bg-primary/5"
                    )}
                  >
                    <span className="text-[10px] uppercase font-black tracking-widest opacity-60 mb-2">{format(day, "EEE")}</span>
                    <span className="text-2xl font-serif font-bold">{format(day, "dd")}</span>
                    <span className="text-sm font-medium opacity-80">{format(day, "MMM")}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="ghost" className="rounded-full" onClick={handleBack}><ChevronLeft className="mr-2 h-4 w-4" /> Back</Button>
              <Button 
                disabled={!bookingData.date} 
                onClick={handleNext}
                className="rounded-full px-8"
              >
                Find Slots <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )
      case 4: // Time Slot
        return (
          <div className="space-y-8">
            <div className="text-center">
              <h3 className="text-3xl font-serif text-primary">Available Slots</h3>
              <p className="text-muted-foreground mt-2 flex items-center justify-center gap-2">
                <Calendar className="w-4 h-4" /> {bookingData.date ? format(parseISO(bookingData.date), "MMMM dd, yyyy") : ""}
              </p>
            </div>
            
            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-center gap-3 text-sm font-medium">
                <AlertCircle className="w-5 h-5" /> {error}
              </div>
            )}

            {loadingSlots ? (
              <div className="py-20 flex flex-col items-center">
                <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                <p className="font-serif italic text-primary/60">Checking the doctor's diary...</p>
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-16 bg-muted/5 rounded-[2rem] border-2 border-dashed border-muted/50">
                <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-30" />
                <p className="font-serif text-xl text-muted-foreground/60">No available slots for this day.</p>
                <p className="text-sm text-muted-foreground mt-2">Try selecting another date.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {slots.map(slot => (
                  <button
                    key={slot.time}
                    disabled={!slot.isAvailable}
                    onClick={() => lockSlot(slot.time)}
                    className={cn(
                      "p-5 rounded-2xl border-2 text-sm font-bold transition-all relative overflow-hidden",
                      !slot.isAvailable ? "bg-muted/30 border-muted/10 opacity-30 cursor-not-allowed" :
                      bookingData.time === slot.time ? "bg-primary text-white border-primary shadow-xl" : 
                      "bg-white border-muted/30 hover:border-primary/40 hover:bg-primary/5"
                    )}
                  >
                    {formatTime12h(slot.time)}
                    {!slot.isAvailable && <div className="absolute inset-x-0 bottom-0 py-0.5 bg-muted text-[8px] font-black uppercase text-center">{slot.reason}</div>}
                  </button>
                ))}
              </div>
            )}
            
            <div className="flex pt-4">
              <Button variant="ghost" className="rounded-full" onClick={handleBack}><ChevronLeft className="mr-2 h-4 w-4" /> Back</Button>
            </div>
          </div>
        )
      case 5: // User Details
        return (
          <div className="space-y-8">
            <div className="text-center">
              <h3 className="text-3xl font-serif text-primary">Your Details</h3>
              <p className="text-muted-foreground mt-2">Almost there! We just need some details.</p>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">Full Name</label>
                  <Input 
                    placeholder="E.g. Siddharth Singh" 
                    value={bookingData.name}
                    onChange={e => setBookingData(d => ({ ...d, name: e.target.value }))}
                    className="h-14 rounded-2xl bg-primary/5 border-none focus:bg-white focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">Email Address</label>
                  <Input 
                    type="email" 
                    placeholder="E.g. sidd@email.com" 
                    value={bookingData.email}
                    onChange={e => setBookingData(d => ({ ...d, email: e.target.value }))}
                    className="h-14 rounded-2xl bg-primary/5 border-none focus:bg-white focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">Gender</label>
                  <select 
                    value={bookingData.gender}
                    onChange={e => setBookingData(d => ({ ...d, gender: e.target.value }))}
                    className="flex h-14 w-full rounded-2xl bg-primary/5 border-none px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M5%207.5L10%2012.5L15%207.5%22%20stroke%3D%22%235A5A40%22%20stroke-width%3D%221.67%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_15px_center] bg-no-repeat"
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Non-binary">Non-binary</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">Age</label>
                  <Input 
                    type="number" 
                    placeholder="Age" 
                    value={bookingData.age}
                    onChange={e => setBookingData(d => ({ ...d, age: e.target.value }))}
                    className="h-14 rounded-2xl bg-primary/5 border-none focus:bg-white focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">Anything you'd like to share?</label>
                <Textarea 
                  placeholder="Tell us a little about what's bringing you to therapy..." 
                  value={bookingData.message}
                  onChange={e => setBookingData(d => ({ ...d, message: e.target.value }))}
                  rows={4}
                  className="rounded-[2rem] bg-primary/5 border-none focus:bg-white focus:ring-2 focus:ring-primary/20 p-6"
                />
              </div>
            </div>
            
            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-center gap-3 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" /> {error}
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="ghost" className="rounded-full" onClick={handleBack}><ChevronLeft className="mr-2 h-4 w-4" /> Back</Button>
              <Button 
                disabled={!bookingData.name || !bookingData.email || !bookingData.gender || !bookingData.age} 
                onClick={handleNext}
                className="rounded-full px-12"
              >
                Review Request <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )
      case 6: // Review
        const selectedTherapist = therapists.find(t => t.id === bookingData.therapistId)
        return (
          <div className="space-y-8">
            <div className="text-center">
              <h3 className="text-3xl font-serif text-primary">Final Review</h3>
              <p className="text-muted-foreground mt-2">Take a moment to check your session details</p>
            </div>
            
            <div className="bg-[#FFFBE7] border-2 border-primary/5 rounded-[3rem] p-10 space-y-8 shadow-sm">
              <div className="flex items-center gap-6 pb-8 border-b border-primary/5">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white shadow-md">
                   <img src={selectedTherapist?.image} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                   <p className="text-[10px] uppercase font-black tracking-[0.2em] text-accent mb-1">Your Specialist</p>
                   <h4 className="text-2xl font-serif font-bold text-primary">{selectedTherapist?.name}</h4>
                   <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest">{selectedTherapist?.specialization}</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-8 text-sm">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Session Focus</p>
                  <p className="font-serif text-lg font-bold text-primary">{bookingData.sessionType} Session</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Chosen Slot</p>
                  <p className="font-serif text-lg font-bold text-primary">
                    {format(parseISO(bookingData.date), "dd MMM")} at {formatTime12h(bookingData.time)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Your Name</p>
                  <p className="font-serif text-lg font-bold text-primary">{bookingData.name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Contact Email</p>
                  <p className="font-serif text-lg font-bold text-primary truncate">{bookingData.email}</p>
                </div>
              </div>
              
              {bookingData.message && (
                <div className="pt-8 border-t border-primary/5">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-3">A Note from You</p>
                  <p className="italic text-primary/80 leading-relaxed">"{bookingData.message}"</p>
                </div>
              )}
            </div>
            
            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-center gap-3 text-sm">
                <AlertCircle className="w-5 h-5" /> {error}
              </div>
            )}

            <div className="flex justify-between pt-6">
              <Button variant="ghost" className="rounded-full" onClick={handleBack}><ChevronLeft className="mr-2 h-4 w-4" /> Go Back</Button>
              <Button 
                className="px-16 h-16 rounded-full text-lg shadow-2xl shadow-primary/20" 
                disabled={submitting} 
                onClick={submitBooking}
              >
                {submitting ? <Loader2 className="animate-spin h-6 w-6" /> : "Confirm Session Request"}
              </Button>
            </div>
          </div>
        )
      case 7: // Success
        return (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 px-4 space-y-10"
          >
            <div className="relative inline-flex items-center justify-center">
              <div className="absolute inset-0 bg-primary/10 rounded-full scale-[1.8] animate-pulse" />
              <div className="relative w-24 h-24 rounded-full bg-primary text-white flex items-center justify-center shadow-2xl shadow-primary/30">
                <CheckCircle2 className="w-12 h-12" />
              </div>
            </div>
            
            <div className="space-y-4 max-w-sm mx-auto">
              <h2 className="text-4xl font-serif text-primary">A Path Forward</h2>
              <p className="text-xl text-muted-foreground leading-relaxed italic">
                “Every journey begins with a single, intentional step.”
              </p>
              <p className="text-muted-foreground">
                Your request has been sent to our specialists. We will confirm your session details via email within 24 hours.
              </p>
            </div>
            
            <Button asChild variant="outline" className="h-14 rounded-full px-12 border-2 hover:bg-primary hover:text-white transition-all duration-500">
              <Link to="/">Return to Home</Link>
            </Button>
          </motion.div>
        )
      default:
        return null
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-12 px-6 overflow-hidden">
      {/* Progress Line */}
      {step < 7 && (
        <div className="mb-16">
          <div className="flex justify-between items-center relative mb-4">
            {[1,2,3,4,5,6].map(i => (
              <div 
                key={i} 
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black z-10 transition-all duration-500",
                  step === i ? "bg-primary text-white scale-125 shadow-lg shadow-primary/20" : 
                  step > i ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground opacity-40"
                )}
              >
                {step > i ? <CheckCircle2 className="w-4 h-4" /> : i}
              </div>
            ))}
            <div className="absolute top-1/2 left-0 w-full h-[1px] bg-muted -translate-y-1/2">
              <div 
                className="h-full bg-primary/30 transition-all duration-700 ease-out" 
                style={{ width: `${(Math.min(step - 1, 5) / 5) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          className="min-h-[500px]"
        >
          {renderStep()}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export default BookingSystem
