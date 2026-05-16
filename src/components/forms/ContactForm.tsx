import * as React from "react"
import { Button } from "../ui/Button"
import { Input } from "../ui/Input"
import { Textarea } from "../ui/Textarea"
import { motion, AnimatePresence } from "motion/react"
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react"

export function ContactForm() {
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [formData, setFormData] = React.useState({
    name: "",
    email: "",
    message: "",
    honeypot: ""
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMessage(null)

    try {
      if (!formData.name || !formData.email || !formData.message) {
         throw new Error("Please fill in all required fields.");
      }
      if (formData.message.length > 2000) {
         throw new Error("Message is too long. Please keep it under 2000 characters.");
      }

      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send message.");
      }

      setStatus('success')
      setFormData({ name: "", email: "", message: "", honeypot: "" })
    } catch (error: any) {
      if (process.env.NODE_ENV !== 'production') console.error("Contact Form Error:", error);
      setStatus('error');
      setErrorMessage(error.message || "Something went wrong while sending your message. Please try again in a moment.");
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
            className="space-y-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="contact-name" className="text-sm font-medium text-text">Name</label>
                <Input
                  required
                  id="contact-name"
                  name="name"
                  type="text"
                  maxLength={100}
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Your full name"
                  className="bg-[#FFFBE7]/20 focus:bg-white transition-all duration-300 h-14"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="contact-email" className="text-sm font-medium text-text">Email Address</label>
                <Input
                  required
                  id="contact-email"
                  name="email"
                  type="email"
                  maxLength={100}
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="name@email.com"
                  className="bg-[#FFFBE7]/20 focus:bg-white transition-all duration-300 h-14"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="contact-message" className="text-sm font-medium text-text">What’s on your mind?</label>
                  <span className="text-xs text-muted-foreground">{formData.message.length}/2000</span>
                </div>
                <Textarea
                  required
                  id="contact-message"
                  name="message"
                  rows={6}
                  maxLength={2000}
                  value={formData.message}
                  onChange={handleChange}
                  placeholder="Feel free to share as much or as little as you want..."
                  className="bg-[#FFFBE7]/20 focus:bg-white transition-all duration-300 p-4"
                />
              </div>
              
              {/* HONEYPOT FIELD - DO NOT REMOVE */}
              <div className="hidden" aria-hidden="true">
                <label htmlFor="contact-honeypot">Leave this field empty</label>
                <input
                  id="contact-honeypot"
                  name="honeypot"
                  type="text"
                  tabIndex={-1}
                  value={formData.honeypot}
                  onChange={handleChange}
                />
              </div>
            </div>

            {status === 'error' && (
              <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 p-4 rounded-xl">
                <AlertCircle className="h-5 w-5" />
                <p>{errorMessage || "Something went wrong while sending your message. Please try again in a moment."}</p>
              </div>
            )}

            <div className="space-y-6">
              <Button
                type="submit"
                disabled={status === 'loading'}
                className="w-full h-16 text-lg rounded-2xl hover:scale-[1.02] hover:shadow-lg transition-all duration-300 active:scale-100 disabled:opacity-70 disabled:hover:scale-100 disabled:cursor-not-allowed"
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Send Your Message"
                )}
              </Button>

              <div className="space-y-2 text-center">
                <p className="text-sm text-muted-foreground">
                  “Your information is kept private and confidential.”
                </p>
                <p className="text-xs text-muted-foreground opacity-60">
                  No pressure. Just share what you feel comfortable with.
                </p>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  )
}
