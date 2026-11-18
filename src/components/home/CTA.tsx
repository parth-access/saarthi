import * as React from "react"
import { Button } from "../ui/Button"
import { motion } from "framer-motion"
import Link from "next/link"
import { trackEvent } from "@/lib/analytics"

interface CTAProps {
  onBookClick?: () => void;
}

const CTA = ({ onBookClick }: CTAProps) => {
  const handleBookClick = () => {
    trackEvent('book_demo_click', {
      location: 'cta_banner',
      cta_text: 'Book a Session'
    });
    if (onBookClick) onBookClick();
  };

  return (
    <section className="py-16 md:py-24 bg-background text-text">
      <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center rounded-[2rem] bg-[linear-gradient(160deg,#E4F1E7,#D2E8D9)] px-6 py-14 text-center md:px-16 md:py-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
            className="max-w-3xl"
          >
            <h2 className="mb-5 text-primary-ink font-serif italic">Start your journey today.</h2>
            <p className="mx-auto mb-9 max-w-2xl text-lg leading-8 text-muted-foreground md:text-xl md:leading-9">
              Take the first step towards emotional clarity and mental wellness. Book your first session with Saarthi today.
            </p>
            <Button 
              asChild
              size="lg" 
              variant="primary"
              onClick={handleBookClick}
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
