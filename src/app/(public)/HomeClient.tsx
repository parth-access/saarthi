"use client";


import * as React from "react"
import Hero from "@/components/home/Hero"
import Services from "@/components/home/Services"
import FeaturedTherapist from "@/components/home/FeaturedTherapist"
import Process from "@/components/home/Process"
import CTA from "@/components/home/CTA"
import { ContactForm } from "@/components/forms/ContactForm"

export default function Home() {
  return (
    <main>
      <Hero />
      <Services />
      <FeaturedTherapist />
      <Process />
      
      <section id="contact" className="py-24 md:py-32 bg-surface">
        <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 md:mb-14">
            <h2 className="text-3xl md:text-4xl font-heading font-medium text-primary-ink mb-4 italic">Get in Touch</h2>
            <p className="text-muted-foreground text-[1.06rem] leading-8 max-w-2xl mx-auto">
              Have questions about our services or want to learn more? Send us a message and we&apos;ll get back to you.
            </p>
          </div>
          <ContactForm />
        </div>
      </section>

      <CTA />
    </main>
  )
}
