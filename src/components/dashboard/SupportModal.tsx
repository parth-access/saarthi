"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, HelpCircle, AlertCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  userName: string;
  userPhone?: string;
  initialMessage?: string;
  initialSubject?: string;
}

export function SupportModal({
  isOpen,
  onClose,
  userEmail,
  userName,
  userPhone = '',
  initialMessage = '',
  initialSubject = 'General Support'
}: SupportModalProps) {
  const [name, setName] = useState(userName);
  const [email, setEmail] = useState(userEmail);
  const [phone, setPhone] = useState(userPhone);
  const [category, setCategory] = useState(initialSubject);
  const [message, setMessage] = useState(initialMessage);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(userName);
      setEmail(userEmail);
      setPhone(userPhone);
      setMessage(initialMessage);
      setCategory(initialSubject);
    }
  }, [isOpen, userName, userEmail, userPhone, initialMessage, initialSubject]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error('Please write a message to send.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        message: `[Dashboard Support Request - Category: ${category}]\nPhone: ${phone}\n\n${message.trim()}`,
        honeypot: ''
      };

      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      toast.success('Your message has been sent. Our team will contact you shortly.');
      onClose();
    } catch (error) {
      console.error('Error submitting support ticket:', error);
      toast.error('Failed to send support request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <React.Fragment>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg origin-center p-4 sm:p-0"
          >
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-primary/10">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-primary/5 bg-[#FFFBE7]/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#E6A520]/10 flex items-center justify-center">
                    <HelpCircle className="w-5 h-5 text-[#E6A520]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-serif text-primary">Contact Support</h3>
                    <p className="text-xs text-primary/60 font-sans">We are here to hold space and assist you.</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-primary/40 hover:text-primary transition-colors hover:bg-black/5 rounded-full"
                  aria-label="Close support modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4 font-sans">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-primary uppercase tracking-wider mb-2">Your Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-2xl border border-primary/15 bg-[#FFFBE7]/10 px-4 py-2.5 text-sm text-primary placeholder:text-primary/30 transition-all focus:outline-none focus:border-[#E6A520] focus:ring-4 focus:ring-[#E6A520]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-primary uppercase tracking-wider mb-2">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-2xl border border-primary/15 bg-[#FFFBE7]/10 px-4 py-2.5 text-sm text-primary placeholder:text-primary/30 transition-all focus:outline-none focus:border-[#E6A520] focus:ring-4 focus:ring-[#E6A520]/10"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-primary uppercase tracking-wider mb-2">Phone Number</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +91 99999 99999"
                      className="w-full rounded-2xl border border-primary/15 bg-[#FFFBE7]/10 px-4 py-2.5 text-sm text-primary placeholder:text-primary/30 transition-all focus:outline-none focus:border-[#E6A520] focus:ring-4 focus:ring-[#E6A520]/10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-primary uppercase tracking-wider mb-2">Inquiry Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-2xl border border-primary/15 bg-[#FFFBE7]/10 px-4 py-2.5 text-sm text-primary focus:outline-none focus:border-[#E6A520] focus:ring-4 focus:ring-[#E6A520]/10"
                    >
                      <option value="General Support">General Support</option>
                      <option value="Booking Help">Booking Help & Slots</option>
                      <option value="Payment Inquiry">Payment & Receipts</option>
                      <option value="Cancellation Request">Request Cancellation</option>
                      <option value="Technical Issue">Technical Difficulties</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-primary uppercase tracking-wider mb-2">How can we support you?</label>
                  <textarea
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="We listen without judgment. Share your concerns, booking queries, or specific assistance details..."
                    className="w-full rounded-2xl border border-primary/15 bg-[#FFFBE7]/10 px-4 py-3 text-sm text-primary placeholder:text-primary/30 transition-all focus:outline-none focus:border-[#E6A520] focus:ring-4 focus:ring-[#E6A520]/10 resize-none"
                  />
                </div>

                <div className="bg-[#FFFBE7] rounded-2xl p-4 flex gap-3 text-xs text-primary/70 leading-relaxed border border-primary/5">
                  <Sparkles className="w-4 h-4 text-[#E6A520] shrink-0 mt-0.5" />
                  <p>Our dedicated care team and founders personally review all messages. We typically respond within 2-4 hours to ensure you receive genuine, quiet support.</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-3 text-sm font-medium text-primary border border-primary/15 bg-transparent hover:bg-primary/5 rounded-2xl transition-all h-[44px]"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-3 text-sm font-medium text-white bg-primary hover:bg-primary/95 rounded-2xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 flex items-center justify-center gap-2 h-[44px]"
                  >
                    {isSubmitting ? (
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    ) : (
                      <React.Fragment>
                        <Send className="w-4 h-4" />
                        Send Support Ticket
                      </React.Fragment>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>
  );
}
