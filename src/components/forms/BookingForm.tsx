import * as React from "react"
import { Button } from "../ui/Button"
import { Input } from "../ui/Input"
import { Textarea } from "../ui/Textarea"
import { motion, AnimatePresence } from "motion/react"
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { db } from "../../lib/firebase"
import { handleFirestoreError, OperationType } from "../../lib/firebaseUtils"

interface BookingFormProps {
  onSuccess?: () => void;
}

export function BookingForm({ onSuccess }: BookingFormProps) {
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [formData, setFormData] = React.useState({
    name: "",
    email: "",
    message: "",
    date: "",
    time: "",
    gender: "",
    age: ""
  })

  // Get today's date in YYYY-MM-DD format for min date restriction
  const today = new Date().toISOString().split('T')[0];

  const timeSlots = [
    "10:00 AM - 12:00 PM",
    "12:00 PM - 2:00 PM",
    "4:00 PM - 6:00 PM",
    "6:00 PM - 8:00 PM"
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')

    try {
      await addDoc(collection(db, 'bookings'), {
          name: formData.name,
          email: formData.email,
          message: formData.message,
          preferredDate: formData.date,
          preferredTime: formData.time,
          gender: formData.gender,
          age: parseInt(formData.age),
          status: 'pending',
          createdAt: serverTimestamp()
      }).catch(err => {
        handleFirestoreError(err, OperationType.CREATE, 'bookings');
      });

      setStatus('success')
      setFormData({ name: "", email: "", message: "", date: "", time: "", gender: "", age: "" })
      if (onSuccess) {
        setTimeout(onSuccess, 3000)
      }
    } catch (error) {
      console.error("Booking error:", error)
      setStatus('error')
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-2xl shadow-sm border border-muted">
      <AnimatePresence mode="wait">
        {status === 'success' ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center py-8"
          >
            <CheckCircle2 className="h-16 w-16 text-primary mb-4" />
            <h3 className="text-xl font-heading font-bold text-text mb-2">Request Sent</h3>
            <p className="text-muted-foreground">Your request has been sent. We'll contact you shortly.</p>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={handleSubmit}
            className="space-y-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-text">Full Name *</label>
              <Input
                required
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-text">Email Address *</label>
              <Input
                required
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="john@example.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="gender" className="text-sm font-medium text-text">Gender *</label>
                <select
                  required
                  id="gender"
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="flex h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all duration-200"
                >
                  <option value="" disabled>Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="age" className="text-sm font-medium text-text">Age *</label>
                <Input
                  required
                  id="age"
                  name="age"
                  type="number"
                  min="1"
                  max="120"
                  value={formData.age}
                  onChange={handleChange}
                  placeholder="25"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="date" className="text-sm font-medium text-text">Preferred Date *</label>
                <Input
                  required
                  id="date"
                  name="date"
                  type="date"
                  min={today}
                  value={formData.date}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="time" className="text-sm font-medium text-text">Preferred Time *</label>
                <select
                  required
                  id="time"
                  name="time"
                  value={formData.time}
                  onChange={handleChange}
                  className="flex h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                >
                  <option value="" disabled>Select a slot</option>
                  {timeSlots.map(slot => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="message" className="text-sm font-medium text-text">Message *</label>
              <Textarea
                required
                id="message"
                name="message"
                rows={3}
                value={formData.message}
                onChange={handleChange}
                placeholder="Briefly describe your concerns..."
              />
            </div>

            {status === 'error' && (
              <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4" />
                <p>Something went wrong. Please try again.</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={status === 'loading'}
              className="w-full py-6 text-lg"
            >
              {status === 'loading' ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                "Request Booking"
              )}
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  )
}
