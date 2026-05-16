import * as React from "react"
import { Button } from "../ui/Button"
import { motion } from "motion/react"
import Link from "next/link"

import { QuoteRotator } from "./QuoteRotator"

interface HeroProps {
  onBookClick?: () => void;
}

const Hero = ({ onBookClick }: HeroProps) => {
  return (
    <section id="home" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#FFFBE7] pt-24 lg:pt-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-20">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col items-center text-center lg:items-start lg:text-left"
          >
            <h1 className="mb-6 text-5xl md:text-6xl lg:text-7xl text-primary font-serif leading-[1.1]">
              Find clarity. Heal. <br />
              <span className="italic text-accent">Move forward.</span>
            </h1>
            <p className="mb-8 text-lg text-muted-foreground md:text-xl lg:max-w-lg">
              Professional psychological guidance to help you navigate life's complexities with emotional clarity and mental wellness.
            </p>
            
            <div className="mb-10 w-full lg:max-w-md">
              <QuoteRotator />
            </div>

            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-start sm:space-x-6 sm:space-y-0">
              <Button asChild size="lg" variant="primary" className="px-10 py-7 text-lg">
                <Link href="/book">Book a Session</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="px-10 py-7 text-lg">
                <Link href="/vision">Learn More</Link>
              </Button>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, x: 30, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            {/* Soft decorative blob */}
            <div className="absolute -inset-10 -z-10 translate-x-10 translate-y-10 rounded-full bg-accent/10 blur-3xl" />
            
            <div className="relative overflow-hidden rounded-[3.5rem] shadow-2xl shadow-primary/10">
              <img
                src="/home_page.jpeg"
                alt="Mental Wellness and Emotional Clarity"
                className="aspect-[4/5] h-full w-full object-cover sm:aspect-video lg:aspect-[4/5]"
                referrerPolicy="no-referrer"
                decoding="async"
              />
              <div className="absolute inset-0 bg-primary/5 mix-blend-multiply" />
            </div>
            
          </motion.div>
        </div>
      </div>
      
      {/* Decorative elements */}
      <div className="absolute -left-20 top-1/4 -z-10 h-64 w-64 rounded-full bg-primary/10 blur-3xl opacity-50" />
      <div className="absolute -right-20 bottom-1/4 -z-10 h-96 w-96 rounded-full bg-accent/10 blur-3xl opacity-50" />
    </section>
  )
}

export default Hero
