import * as React from "react"
import { db } from "../../lib/firebase"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import emailjs from "@emailjs/browser"
import { Button } from "../ui/Button"
import { Input } from "../ui/Input"
import { Textarea } from "../ui/Textarea"
import { motion, AnimatePresence } from "motion/react"
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react"

export function ContactForm() {
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [formData, setFormData] = React.useState({
    name: "",
    email: "",
    message: ""
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')

    try {
      // 1. Save to Firestore
      await addDoc(collection(db, 'contacts'), {
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
            type: 'Contact Message'
          },
          publicKey
        );
      }

      setStatus('success')
      setFormData({ name: "", email: "", message: "" })
    } catch (error) {
      console.error("Contact error:", error)
      setStatus('error')
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <AnimatePresence mode="wait">
        {status === 'success' ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center py-12 bg-primary/5 rounded-3xl border border-primary/10"
          >
            <CheckCircle2 className="h-16 w-16 text-primary mb-4" />
            <h3 className="text-2xl font-heading font-bold text-text mb-2">Message Sent</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Thank you for reaching out. We've received your message and will get back to you as soon as possible.
            </p>
            <Button 
              variant="outline" 
              className="mt-8"
              onClick={() => setStatus('idle')}
            >
              Send another message
            </Button>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="space-y-2">
              <label htmlFor="contact-name" className="text-sm font-medium text-text">Name</label>
              <Input
                required
                id="contact-name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                placeholder="Your name"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="contact-email" className="text-sm font-medium text-text">Email</label>
              <Input
                required
                id="contact-email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="your@email.com"
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <label htmlFor="contact-message" className="text-sm font-medium text-text">How can we help?</label>
              <Textarea
                required
                id="contact-message"
                name="message"
                rows={5}
                value={formData.message}
                onChange={handleChange}
                placeholder="Your message..."
              />
            </div>

            {status === 'error' && (
              <div className="md:col-span-2 flex items-center gap-2 text-red-500 text-sm bg-red-50 p-4 rounded-xl">
                <AlertCircle className="h-5 w-5" />
                <p>Something went wrong. Please try again.</p>
              </div>
            )}

            <div className="md:col-span-2 flex justify-center mt-4">
              <Button
                type="submit"
                disabled={status === 'loading'}
                className="px-12 py-6 text-lg rounded-full"
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Message"
                )}
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  )
}
