"use client";


import Image from "next/image";
import * as React from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/Button"
import Link from "next/link"
import { Compass, Sun, Wind, Quote } from "lucide-react"

export default function VisionPage() {
  const pillars = [
    {
      icon: <Wind className="w-5 h-5" />,
      title: "Quiet Sanctuary",
      description: "A calm and comfortable space where you can take a moment for yourself."
    },
    {
      icon: <Compass className="w-5 h-5" />,
      title: "Gentle Guidance",
      description: "Support that walks with you, not ahead of you."
    },
    {
      icon: <Compass className="w-5 h-5" />, // Keep simple
      title: "Cultural Empathy",
      description: "Understanding your background, your story, and what matters to you."
    },
    {
      icon: <Sun className="w-5 h-5" />,
      title: "Holistic Growth",
      description: "Helping you grow with clarity, balance, and confidence."
    }
  ]

  return (
    <div className="pt-32 pb-24 bg-background min-h-screen selection:bg-primary/10 overflow-x-hidden">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[10%] -left-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-[20%] -right-20 w-[30rem] h-[30rem] bg-accent/5 rounded-full blur-3xl opacity-50" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-[0.02] bg-[url('https://www.transparenttextures.com/patterns/paper-fibers.png')]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section 1: Our Vision Hero */}
        <section className="mb-32">
          <div className="max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
              className="flex items-center gap-4 mb-8"
            >
              <div className="h-px w-12 bg-accent/40" />
              <span className="text-accent font-medium tracking-[0.3em] uppercase text-xs">Our Vision</span>
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1] }}
              className="text-4xl md:text-6xl lg:text-[4.3rem] text-primary-ink font-medium leading-[1.1] tracking-tight mb-10"
            >
              Our Vision — <br />
              <span className="italic font-normal text-accent">Making Emotional Well-being Simple</span>
            </motion.h1>
            
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.5 }}
              className="space-y-6 max-w-2xl"
            >
              <p className="text-xl md:text-2xl text-text/80 leading-relaxed font-serif italic">
                Saarthi is built to make emotional well-being feel simple, natural, and accessible.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                A space where understanding yourself feels comfortable, not complicated.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Section 2: Vision Statement (Moved Up) */}
        <section className="mb-32 md:mb-40">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2 }}
              className="relative"
            >
              <div className="relative aspect-[4/5] rounded-[1.75rem] overflow-hidden shadow-[0_24px_50px_-30px_rgba(38,68,58,0.35)]">
                <Image
                   src="/vision_page.webp"
                   alt="Visionary landscape"
                   width={1024}
                   height={1536}
                   sizes="(min-width: 1024px) 50vw, 100vw"
                   className="w-full h-full object-cover saturate-[.88]"
                />
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(246,247,243,0)_55%,rgba(38,68,58,0.10)),rgba(200,165,114,0.06)]" />
              </div>
              <div className="absolute -bottom-8 -right-4 md:-right-8 w-44 h-44 bg-surface border border-muted rounded-full flex items-center justify-center text-primary-ink shadow-[0_18px_40px_-24px_rgba(38,68,58,0.4)] rotate-6 p-7 text-center">
                <p className="text-sm font-serif italic">&quot;Building a world where people feel safe to grow.&quot;</p>
              </div>
            </motion.div>

            <div className="space-y-12">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
                className="space-y-6"
              >
                <span className="text-accent font-medium tracking-widest uppercase text-xs">The Future We See</span>
                <h2 className="text-4xl md:text-6xl text-primary-ink leading-tight">
                  A world where <br />
                  <span className="italic font-normal text-accent">well-being is normal.</span>
                </h2>
              </motion.div>

              <div className="space-y-10">
                <p className="text-xl text-muted-foreground leading-relaxed">
                  We envision a world where taking care of your mental well-being feels normal and accessible.
                </p>
                <p className="text-lg text-muted-foreground/80 leading-relaxed">
                  A world where people feel comfortable expressing themselves and growing without hesitation.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Belief Statement (Smaller, not dramatic) */}
        <section className="mb-32 md:mb-40">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="p-12 md:p-16 rounded-[1.75rem] bg-surface border border-muted shadow-[0_18px_40px_-34px_rgba(38,68,58,0.35)] hover:-translate-y-[3px] hover:shadow-[0_18px_40px_-28px_rgba(38,68,58,0.4)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:hover:translate-y-0"
            >
              <span className="text-accent font-medium tracking-widest uppercase text-xs mb-6 block">Our Belief</span>
              <h2 className="text-4xl md:text-5xl font-serif text-primary-ink mb-8 italic">Feeling understood should be natural</h2>
              <div className="space-y-6 max-w-2xl mx-auto text-lg text-muted-foreground leading-relaxed">
                <p>
                  We believe emotional well-being should feel simple and approachable.
                </p>
                <p>
                  Support should feel comfortable, not overwhelming.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Section 4: The Saarthi Way */}
        <section className="mb-32 md:mb-40">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="space-y-4"
            >
              <span className="text-accent font-medium tracking-widest uppercase text-xs">The Saarthi Way</span>
              <h2 className="text-4xl md:text-6xl text-primary-ink">Our Pillars of Care</h2>
            </motion.div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pillars.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-8 rounded-[1.75rem] bg-surface border border-muted shadow-[0_18px_40px_-34px_rgba(38,68,58,0.35)] hover:-translate-y-[3px] hover:shadow-[0_18px_40px_-28px_rgba(38,68,58,0.4)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:hover:translate-y-0 group"
              >
                <div className="h-12 w-12 rounded-2xl bg-sage flex items-center justify-center text-primary mb-6 group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                  {item.icon}
                </div>
                <h3 className="text-xl font-semibold text-primary-ink mb-3">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Section 5: Closing Section */}
        <section className="text-center pb-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto space-y-16"
          >
            <div className="space-y-6">
              <span className="text-accent font-medium tracking-widest uppercase text-xs">Your Journey Matters</span>
              <h2 className="text-5xl md:text-7xl text-primary-ink leading-[1.1]">
                Every Step <br />
                <span className="italic font-normal text-accent select-none">Matters.</span>
              </h2>
              <div className="space-y-8">
                <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-2xl mx-auto font-serif italic">
                  Every step you take towards understanding yourself matters.
                </p>
                <div className="flex justify-center items-center gap-4 text-accent/50">
                  <Quote className="w-8 h-8 rotate-180" />
                  <p className="text-2xl md:text-3xl text-primary-ink font-serif italic max-w-xl">
                    Mental wellness isn&apos;t a destination you reach; it&apos;s a way of traveling.
                  </p>
                  <Quote className="w-8 h-8" />
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-center gap-8">
              <Button asChild size="lg" className="h-14 px-10 text-base">
                <Link href="/therapists">Find Your Saarthi</Link>
              </Button>
              <p className="text-muted-foreground text-sm tracking-widest uppercase">We’re here whenever you’re ready.</p>
            </div>
          </motion.div>
        </section>

      </div>
    </div>
  )
}
