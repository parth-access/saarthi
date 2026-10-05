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
    <section id="process" className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-primary font-serif">How It Works</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            A simple, four-step process to help you find emotional clarity and mental wellness.
          </p>
        </div>
        
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="relative"
            >
              <div className="mb-6 text-5xl font-bold text-primary/10 font-serif">{step.number}</div>
              <h3 className="mb-4 text-xl font-serif text-primary">{step.title}</h3>
              <p className="text-base text-muted-foreground">
                {step.description}
              </p>
              {index < steps.length - 1 && (
                <div className="absolute right-0 top-1/4 hidden h-px w-1/2 bg-primary/10 lg:block" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Process
