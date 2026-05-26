import * as React from "react"
import { Button } from "../ui/Button"
import { motion } from "framer-motion"

import Link from "next/link"

interface CTAProps {
  onBookClick?: () => void;
}

const CTA = ({ onBookClick }: CTAProps) => {
  return (
    <section className="py-24 bg-primary text-primary-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="max-w-3xl"
          >
            <h2 className="mb-6 text-white font-serif italic">Start your journey today.</h2>
            <p className="mb-10 text-lg text-primary-foreground/80 md:text-xl">
              Take the first step towards emotional clarity and mental wellness. Book your first session with Saarthi today.
            </p>
            <Button 
              asChild
              size="lg" 
              variant="accent" 
              className="text-primary font-bold"
              onClick={onBookClick}
            >
              <Link href="/book">Book a Session</Link>
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default CTA
