import * as React from "react"
import { Button } from "../ui/Button"
import { motion } from "motion/react"
import { Link } from "react-router-dom"

import { QuoteRotator } from "./QuoteRotator"

interface HeroProps {
  onBookClick?: () => void;
}

const Hero = ({ onBookClick }: HeroProps) => {
  return (
    <section id="home" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background pt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-3xl"
          >
            <h1 className="mb-6 text-primary font-serif">
              Find clarity. Heal. <br />
              <span className="italic text-accent">Move forward.</span>
            </h1>
            <p className="mb-10 text-lg text-muted-foreground md:text-xl">
              Professional psychological guidance to help you navigate life's complexities with emotional clarity and mental wellness.
            </p>
            
            <QuoteRotator />

            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-center sm:space-x-6 sm:space-y-0">
              <Button size="lg" variant="primary" onClick={onBookClick}>
                Book a Session
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/vision">Learn More</Link>
              </Button>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="mt-16 w-full max-w-4xl overflow-hidden rounded-3xl shadow-2xl"
          >
            <img
              src="https://picsum.photos/seed/wellness/1200/600"
              alt="Mental Wellness and Emotional Clarity"
              className="h-full w-full object-cover opacity-90"
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          </motion.div>
        </div>
      </div>
      
      {/* Decorative elements */}
      <div className="absolute -left-20 top-1/4 -z-10 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute -right-20 bottom-1/4 -z-10 h-96 w-96 rounded-full bg-accent/5 blur-3xl" />
    </section>
  )
}

export default Hero
