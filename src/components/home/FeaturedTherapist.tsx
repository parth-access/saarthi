import * as React from "react"
import { motion } from "motion/react"
import { Button } from "../ui/Button"
import { Link } from "react-router-dom"

const FeaturedTherapist = () => {
  return (
    <section id="featured-therapist" className="py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="relative overflow-hidden rounded-3xl shadow-2xl">
              <img
                src="/Gemini_Generated_Image_1q2v1m1q2v1m1q2v.png"
                alt="Dravina Gupta - Certified Psychologist at Saarthi"
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-primary/10" />
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="mb-6">
              <h4 className="text-sm font-bold uppercase tracking-widest text-accent mb-4">Featured Therapist</h4>
              <h2 className="text-4xl font-bold text-primary font-serif mb-2">Dravina Gupta</h2>
              <p className="text-xl text-accent font-medium italic">Therapist | Psychologist</p>
            </div>

            <div className="mb-8">
              <p className="text-lg text-muted-foreground leading-relaxed max-w-md">
                Helping individuals navigate anxiety, stress, and emotional challenges with a safe, non-judgmental approach.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <Button asChild variant="outline" size="lg">
                <Link to="/therapists/dravina">
                  Know Your Saarthi
                </Link>
              </Button>
              <Button size="lg">
                Book Session
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default FeaturedTherapist
