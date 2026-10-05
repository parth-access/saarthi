import * as React from "react"
import { motion } from "framer-motion"
import { CheckCircle2 } from "lucide-react"

interface ApproachProps {
  items: string[]
}

const Approach = ({ items }: ApproachProps) => {
  return (
    <section id="approach" className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="mb-6 text-primary font-serif italic">Therapeutic Approach</h2>
            <p className="mb-10 text-lg text-muted-foreground leading-relaxed">
              My therapeutic approach is integrative, drawing from various evidence-based practices to tailor the session to your unique needs.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {items.map((approach, index) => (
                <motion.div
                  key={approach}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-primary/5 border border-primary/5"
                >
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                  <span className="text-lg font-medium text-primary">{approach}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
            className="relative overflow-hidden rounded-3xl shadow-2xl"
          >
            <img
              src="/vision_page.png"
              alt="Therapeutic Approach"
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-primary/10" />
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default Approach
