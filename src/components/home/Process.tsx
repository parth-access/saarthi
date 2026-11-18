import * as React from "react"
import { motion } from "framer-motion"

const steps = [
  {
    title: "Book a session",
    description: "Schedule your first consultation through our simple online booking system.",
    number: "01",
  },
  {
    title: "Talk to expert",
    description: "Meet with a professional psychologist in a safe, confidential environment.",
    number: "02",
  },
  {
    title: "Get guidance",
    description: "Receive personalized emotional clarity and life guidance based on your needs.",
    number: "03",
  },
  {
    title: "Improve your life",
    description: "Implement positive changes and move forward with clarity and resilience.",
    number: "04",
  },
]

const Process = () => {
  return (
    <section id="process" className="py-24 md:py-32 bg-surface">
      <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-8">
        <div className="mb-14 md:mb-16 text-center">
          <h2 className="mb-4 text-primary-ink font-serif">How It Works</h2>
          <p className="mx-auto max-w-2xl text-[1.06rem] leading-8 text-muted-foreground">
            A simple, four-step process to help you find emotional clarity and mental wellness.
          </p>
        </div>
        
        <div className="relative grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <div aria-hidden="true" className="absolute left-6 right-6 top-6 hidden h-px bg-muted lg:block" />
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: index * 0.08, ease: [0.22, 0.61, 0.36, 1] }}
              className="group relative"
            >
              <div className="relative mb-6 grid h-12 w-12 place-items-center rounded-full border border-muted bg-surface font-serif text-lg text-primary transition-colors duration-300 group-hover:border-primary/35 group-hover:bg-sage">{step.number}</div>
              <h3 className="mb-3 text-xl font-serif text-primary-ink">{step.title}</h3>
              <p className="text-base leading-7 text-muted-foreground">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Process
