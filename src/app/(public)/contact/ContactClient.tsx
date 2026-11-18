"use client";

import * as React from "react"
import { motion } from "framer-motion"
import { Mail, MapPin, Calendar, ArrowRight, HeartHandshake } from "lucide-react"
import { ContactForm } from "@/components/forms/ContactForm"
import Link from "next/link"
import { trackEvent } from "@/lib/analytics"

export default function ContactPage() {
  return (
    <div className="pt-32 pb-24 bg-background min-h-screen overflow-x-hidden">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[10%] -left-20 w-96 h-96 bg-sage rounded-full blur-3xl opacity-70" />
        <div className="absolute bottom-[20%] -right-20 w-[30rem] h-[30rem] bg-accent-soft/40 rounded-full blur-3xl opacity-60" />
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        
        {/* 1. Header Section */}
        <section className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
            className="space-y-6"
          >
            <h1 className="text-5xl md:text-6xl font-serif text-primary-ink leading-[1.08] tracking-tight">
              Contact Saarthi
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-sans leading-relaxed">
              Not sure where to start? That’s okay. You can simply share what you’re feeling, and we’ll guide you with empathy.
            </p>
          </motion.div>
        </section>

        <div className="grid lg:grid-cols-12 gap-16 items-start">
          {/* 2. Contact Information Section (Left Side - Info Panel) */}
          <div className="lg:col-span-5 space-y-12 h-full flex flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="space-y-10"
            >
              <div className="space-y-2">
                <h2 className="text-3xl md:text-4xl font-serif text-primary-ink leading-tight">
                  We’re here to listen.
                </h2>
                <p className="text-muted-foreground text-lg">
                  Reach out for support, questions, or to understand how therapy can support your mental journey.
                </p>
              </div>

              <div className="space-y-8">
                <div className="flex items-start gap-5">
                  <div className="h-14 w-14 rounded-2xl bg-sage flex items-center justify-center text-primary shrink-0">
                    <Mail className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-medium text-primary-ink font-serif">Email Us</h3>
                    <a href="mailto:contact@saarthilife.com" className="text-primary hover:text-primary-deep underline decoration-accent/40 underline-offset-4 hover:decoration-accent font-medium transition-colors block text-lg">
                      contact@saarthilife.com
                    </a>
                    <p className="text-sm text-muted-foreground italic">We usually respond within 24 hours</p>
                  </div>
                </div>

                <div className="flex items-start gap-5">
                  <div className="h-14 w-14 rounded-2xl bg-sage flex items-center justify-center text-primary shrink-0">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-medium text-primary-ink font-serif">Our Location</h3>
                    <p className="text-text text-lg font-medium">Delhi, India</p>
                    <p className="text-sm text-muted-foreground italic">Based in Delhi, offering online sessions across India</p>
                  </div>
                </div>

                <div className="flex items-start gap-5">
                  <div className="h-14 w-14 rounded-2xl bg-sage flex items-center justify-center text-primary shrink-0">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-medium text-primary-ink font-serif">Support Sessions</h3>
                    <p className="text-text text-lg font-medium">Online Counselling</p>
                    <p className="text-sm text-muted-foreground italic">Confidential, safe, and tailored clinical care</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* 3. Contact Form Section (Right Side) */}
          <div className="lg:col-span-7">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="space-y-6"
            >
              {/* Human Touch Note */}
              <div className="bg-sage p-6 rounded-[1.5rem] mb-2">
                <p className="text-primary-ink/90 font-medium italic text-center text-base">
                  “You’ll be guided by a certified psychologist with a compassionate and non-judgmental approach.”
                </p>
              </div>

              <div>
                <ContactForm />
              </div>
            </motion.div>
          </div>
        </div>

        {/* Crisis Helpline Support Notice */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-20 p-8 rounded-[1.5rem] bg-accent-soft/30 border border-accent-soft flex flex-col md:flex-row items-start md:items-center gap-6"
        >
          <div className="h-12 w-12 rounded-2xl bg-surface text-accent flex items-center justify-center shrink-0">
            <HeartHandshake className="h-6 w-6 text-accent" />
          </div>
          <div className="space-y-1 flex-1">
            <h4 className="text-base font-medium text-primary-ink font-serif flex items-center gap-2">
              In immediate distress or need crisis support?
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              If you or someone you know is undergoing an acute emergency, please contact 24/7 national helplines: 
              <span className="font-semibold text-primary"> Tele-MANAS (14416 / 1800-891-4416)</span>, 
              <span className="font-semibold text-primary"> KIRAN (1800-599-0019)</span>, or emergency services at <span className="font-semibold text-primary">112</span>.
            </p>
          </div>
        </motion.div>

        {/* 4. Secondary CTA (Bottom) */}
        <motion.section 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-24 pt-16 border-t border-muted text-center"
        >
          <div className="max-w-xl mx-auto space-y-8">
            <h3 className="text-2xl font-serif text-primary-ink">Prefer to start directly?</h3>
            <p className="text-muted-foreground font-sans">
              If you feel ready, you can browse verified psychologists or book a consultation session directly.
            </p>
            <Link 
              href="/therapists"
              onClick={() => {
                trackEvent('navigate_to_therapists', {
                  location: 'contact_page_bottom_cta',
                   cta_text: 'Browse therapists'
                });
              }}
              className="group inline-flex items-center gap-2 h-12 px-7 bg-surface border border-muted text-primary hover:border-primary/40 hover:bg-sage hover:-translate-y-px transition-all duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] rounded-[14px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
               Browse therapists
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </motion.section>
      </div>
    </div>
  )
}
