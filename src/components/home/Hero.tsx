import Image from "next/image";
import * as React from "react"
import { Button } from "../ui/Button"
import { motion } from "framer-motion"
import Link from "next/link"
import { trackEvent } from "@/lib/analytics"
import { ArrowRight, Heart, ShieldCheck } from "lucide-react"

import { QuoteRotator } from "./QuoteRotator"

interface HeroProps {
  onBookClick?: () => void;
}

const Hero = ({ onBookClick }: HeroProps) => {
  const handleBookClick = () => {
    trackEvent('book_demo_click', {
      location: 'hero_section',
      cta_text: 'Book a Session'
    });
    if (onBookClick) onBookClick();
  };
  return (
    <section
      id="home"
      className="relative flex min-h-[92vh] items-center overflow-hidden bg-background pt-28 pb-20 lg:pt-36 lg:pb-28 bg-[radial-gradient(900px_500px_at_85%_20%,rgba(232,168,56,0.13),transparent_70%),radial-gradient(800px_500px_at_0%_80%,rgba(30,106,69,0.08),transparent_70%)]"
    >
      <div className="mx-auto w-full max-w-[1160px] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-14 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1] }}
            className="flex flex-col items-center text-center lg:items-start lg:text-left"
          >
            <h1 className="mb-6 text-[2.8rem] md:text-6xl lg:text-[3.75rem] xl:text-[4.5rem] text-primary-ink font-serif font-semibold leading-[1.06] tracking-[-0.02em]">
              Find clarity. Heal. <br />
              <span className="italic text-accent-bright">Move forward.</span>
            </h1>
            <p className="mb-8 text-lg leading-8 text-muted-foreground md:text-xl md:leading-9 lg:max-w-lg">
              {"Professional psychological guidance to help you navigate life's complexities with emotional clarity and mental wellness."}
            </p>

            <div className="mb-9 w-full lg:max-w-md">
              <QuoteRotator />
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <Button asChild size="lg" variant="primary" className="group" onClick={handleBookClick}>
                <Link href="/book">
                  Book a Session
                  <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/vision">Learn More</Link>
              </Button>
            </div>

            <p className="mt-7 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
              Govt. Registered | MSME
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, delay: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
            className="group relative mx-auto w-full max-w-[520px] lg:max-w-none"
          >
            <div className="relative overflow-hidden rounded-[1.75rem] shadow-[0_24px_50px_-30px_rgba(19,59,41,0.35)]">
              <Image
                src="/home_page.webp"
                alt="Mental Wellness and Emotional Clarity"
                width={1600}
                height={1067}
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="aspect-[4/3.4] h-full w-full scale-[1.03] object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:scale-[1.06] motion-reduce:transition-none lg:aspect-[4/4.6]"
              />
              {/* One soft treatment for every photo: a faint warm wash and a light inner edge. */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(180deg,rgba(248,247,241,0)_60%,rgba(19,59,41,0.08))] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]" />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
              className="absolute -bottom-5 left-4 flex items-center gap-3 rounded-2xl border border-muted bg-surface px-4 py-3 text-sm font-medium text-primary-ink shadow-[0_14px_30px_-18px_rgba(19,59,41,0.4)] lg:-left-6"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-sage text-primary">
                <Heart aria-hidden="true" className="h-4 w-4" />
              </span>
              Your Safe Space
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default Hero
