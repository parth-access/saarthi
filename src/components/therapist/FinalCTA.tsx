import * as React from "react"
import { Button } from "../ui/Button"
import { motion } from "framer-motion"
import Link from "next/link"
import { trackEvent } from "@/lib/analytics"

interface FinalCTAProps {
  onBookClick?: () => void;
  bookingHref: string;
}

const FinalCTA = ({ onBookClick, bookingHref }: FinalCTAProps) => {
  const handleBookClick = () => {
    trackEvent('book_demo_click', {
      location: 'therapist_final_cta',
      cta_text: 'Book a Session'
    });
    if (onBookClick) onBookClick();
  };

  return (
    <section id="contact" className="py-16 md:py-24 bg-background text-text">
      <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center rounded-[2rem] bg-[linear-gradient(160deg,#E9EFEA,#DFE8E1)] px-6 py-14 text-center md:px-16 md:py-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
            className="max-w-3xl"
          >
            <h2 className="mb-5 text-primary-ink font-serif italic">Schedule a consultation today.</h2>
            <p className="mx-auto mb-9 max-w-2xl text-lg leading-8 text-muted-foreground md:text-xl md:leading-9">
              Ready to address your concerns? Book a session to discuss your requirements and begin a structured approach to your mental well-being.
            </p>
            <Button asChild size="lg" variant="primary" onClick={handleBookClick}>
              <Link href={bookingHref}>Book a Session</Link>
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default FinalCTA
