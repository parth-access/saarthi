import * as React from "react"
import { motion } from "motion/react"
import { GraduationCap } from "lucide-react"

interface Qualification {
  degree: string
  institution: string
  year: string
}

interface QualificationsProps {
  items: Qualification[]
}

const Qualifications = ({ items }: QualificationsProps) => {
  return (
    <section id="qualifications" className="py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="mb-6 text-primary font-serif italic">Qualifications</h2>
            <p className="mb-10 text-lg text-muted-foreground leading-relaxed">
              My academic background and professional training are the foundation of my clinical practice.
            </p>
            
            <div className="space-y-6">
              {items.map((qual, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="flex items-center gap-6 p-6 rounded-3xl bg-white shadow-sm border border-primary/5"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/5">
                    <GraduationCap className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-primary">{qual.degree}</h4>
                    <p className="text-sm text-muted-foreground">{qual.institution} • {qual.year}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative overflow-hidden rounded-3xl shadow-2xl"
          >
            <img
              src="https://picsum.photos/seed/qualifications/1000/800"
              alt="Qualifications"
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

export default Qualifications
