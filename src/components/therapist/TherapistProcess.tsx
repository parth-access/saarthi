import * as React from "react"
import { motion } from "framer-motion"

const steps = [
  {
    title: "Understanding You",
    description: "We begin by exploring your experiences and challenges in a safe, judgment-free space.",
    number: "01",
  },
  {
    title: "Clarity & Patterns",
    description: "We work together to identify the underlying patterns and thoughts that may be holding you back.",
    number: "02",
  },
  {
    title: "Practical Tools",
    description: "I provide you with actionable tools and strategies that feel manageable and practical for your life.",
    number: "03",
  },
  {
    title: "Ongoing Support",
    description: "We continue to collaborate and refine our approach as you move forward with clarity.",
    number: "04",
  },
]

const TherapistProcess = () => {
  return (
    <section id="process" className="py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-primary font-serif">How Sessions Work</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            My therapeutic process is designed to be collaborative, practical, and deeply supportive of your journey.
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

export default TherapistProcess
