import * as React from "react"
import { motion } from "framer-motion"

interface AboutSectionProps {
  content: string[]
}

const AboutSection = ({ content }: AboutSectionProps) => {
  return (
    <section id="about" className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-start">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="mb-8 text-primary font-serif italic">About Me</h2>
            <div className="space-y-6">
              {content.map((paragraph, index) => (
                <p key={index} className="text-lg text-muted-foreground leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="bg-background p-12 rounded-3xl border border-primary/5 shadow-sm"
          >
            <h3 className="mb-6 text-primary font-serif">My Philosophy</h3>
            <p className="text-lg text-muted-foreground italic leading-relaxed">
              {"\"I believe that therapy is a collaborative journey. My goal is to provide you with the tools and clarity needed to navigate life's challenges, ensuring you feel supported every step of the way.\""}
            </p>
            <div className="mt-8 flex items-center gap-4">
              <div className="h-px flex-1 bg-primary/10" />
              <span className="text-sm font-medium text-primary uppercase tracking-widest">Saarthi</span>
              <div className="h-px flex-1 bg-primary/10" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default AboutSection
