import Image from "next/image";
import * as React from "react"
import { motion } from "framer-motion"
import { Button } from "../ui/Button"
import Link from "next/link"
import { trackEvent } from "@/lib/analytics"

interface FeaturedTherapistProps {
  onBookClick?: () => void;
}

const FeaturedTherapist = ({ onBookClick }: FeaturedTherapistProps) => {
  const handleBookClick = () => {
    trackEvent('book_demo_click', {
      location: 'featured_therapist_section',
      cta_text: 'Book Session'
    });
    if (onBookClick) onBookClick();
  };
  return (
    <section id="featured-therapist" className="py-24 md:py-32 bg-background">
      <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-14 lg:grid-cols-2 lg:items-center lg:gap-24">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
            className="group mx-auto w-full max-w-[460px] lg:max-w-none"
          >
            <div className="relative overflow-hidden rounded-[1.75rem] shadow-[0_24px_50px_-30px_rgba(19,59,41,0.35)]">
              <Image
                src="/dravina.webp"
                alt="Dravina Gupta - Counselling Psychologist at Saarthi"
                width={1024}
                height={1024}
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="aspect-[4/4.4] h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:scale-[1.03] motion-reduce:transition-none"
              />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(180deg,rgba(248,247,241,0)_60%,rgba(19,59,41,0.08))] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]" />
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <div className="mb-6">
              <h4 className="font-sans text-xs font-semibold uppercase tracking-[0.16em] text-primary mb-4">Featured Therapist</h4>
              <h2 className="text-4xl md:text-5xl font-semibold text-primary-ink font-serif mb-3">Dravina Gupta</h2>
              <p className="font-serif text-lg md:text-xl text-accent italic">Founder | Counselling Psychologist</p>
            </div>

            <div className="mb-8">
              <p className="text-lg text-muted-foreground leading-8 max-w-md">
                Helping individuals navigate anxiety, stress, and emotional challenges with a safe, non-judgmental approach.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline" size="lg">
                <Link href="/therapists/dravina">
                  Know Your Saarthi
                </Link>
              </Button>
              <Button asChild size="lg" onClick={handleBookClick}>
                <Link href="/book">
                  Book Session
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default FeaturedTherapist
