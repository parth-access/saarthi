import Image from "next/image";
import * as React from "react"
import { motion } from "framer-motion"
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
      <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <h2 className="mb-6 text-primary-ink font-serif italic">Qualifications</h2>
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
                  className="flex items-center gap-6 p-6 rounded-[1.75rem] bg-surface border border-muted"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sage">
                    <GraduationCap className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-lg font-medium text-primary-ink">{qual.degree}</h4>
                    {(qual.institution || qual.year) && (
                      <p className="text-sm text-muted-foreground">{[qual.institution, qual.year].filter(Boolean).join(" • ")}</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative overflow-hidden rounded-[1.75rem] shadow-[0_24px_50px_-30px_rgba(38,68,58,0.35)]"
          >
            <Image
              src="/vision_page.webp"
              alt="Qualifications"
              width={1024}
              height={1536}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-primary/10" />
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default Qualifications
