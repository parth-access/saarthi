import * as React from "react"
import { db } from "../../lib/firebase"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import emailjs from "@emailjs/browser"
import { Button } from "../ui/Button"
import { Input } from "../ui/Input"
import { Textarea } from "../ui/Textarea"
import { motion, AnimatePresence } from "motion/react"
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react"

interface BookingFormProps {
  onSuccess?: () => void;
}

export function BookingForm({ onSuccess }: BookingFormProps) {
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [formData, setFormData] = React.useState({
    name: "",
    email: "",
    message: "",
    preferredTime: ""
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')

    try {
      // 1. Save to Firestore
      await addDoc(collection(db, 'bookings'), {
        ...formData,
        createdAt: serverTimestamp()
      })

      // 2. Send Email via EmailJS (if configured)
      const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
      const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
      const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

      if (serviceId && templateId && publicKey) {
        await emailjs.send(
          serviceId,
          templateId,
          {
            from_name: formData.name,
            from_email: formData.email,
            message: formData.message,
            preferred_time: formData.preferredTime,
            type: 'Booking Request'
          },
          publicKey
        );
      }

      setStatus('success')
      setFormData({ name: "", email: "", message: "", preferredTime: "" })
      if (onSuccess) {
        setTimeout(onSuccess, 2000)
      }
    } catch (error) {
      console.error("Booking error:", error)
      setStatus('error')
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
            <h3 className="text-xl font-heading font-bold text-text mb-2">Booking Received</h3>
            <p className="text-muted-foreground">We'll get back to you shortly to confirm your session.</p>
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

            <div className="space-y-2">
              <label htmlFor="preferredTime" className="text-sm font-medium text-text">Preferred Time (Optional)</label>
              <Input
                id="preferredTime"
                name="preferredTime"
                type="text"
                value={formData.preferredTime}
                onChange={handleChange}
                placeholder="e.g. Monday Afternoon"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="message" className="text-sm font-medium text-text">Message *</label>
              <Textarea
                required
                id="message"
                name="message"
                rows={4}
                value={formData.message}
                onChange={handleChange}
                placeholder="Tell us a bit about what you're looking for..."
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
