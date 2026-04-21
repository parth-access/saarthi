import * as React from "react"
import { Button } from "../ui/Button"
import { MapPin, Languages, Calendar } from "lucide-react"
import { motion } from "motion/react"

interface ProfileHeroProps {
  name: string
  title: string
  location: string
  languages: string[]
  experience: string
  shortIntro: string
  image?: string
  onBookClick?: () => void
}

const ProfileHero = ({
  name,
  title,
  location,
  languages,
  experience,
  shortIntro,
  image,
  onBookClick,
}: ProfileHeroProps) => {
  return (
    <section className="relative pt-32 pb-16 md:pt-48 md:pb-24 bg-background overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h1 className="text-primary font-serif mb-4">{name}</h1>
            <p className="text-xl md:text-2xl text-accent font-serif italic mb-6">{title}</p>
            
            <div className="flex flex-wrap gap-6 mb-8 text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="text-sm">{location}</span>
              </div>
              <div className="flex items-center gap-2">
                <Languages className="h-4 w-4 text-primary" />
                <span className="text-sm">{languages.join(", ")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-sm">{experience} Experience</span>
              </div>
            </div>

            <p className="text-lg text-muted-foreground mb-10 max-w-xl">
              {shortIntro}
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" variant="primary" onClick={onBookClick}>
                Book Session
              </Button>
              <Button size="lg" variant="outline" onClick={onBookClick}>
                View Schedule
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative"
          >
            <div className="aspect-[4/5] overflow-hidden rounded-3xl shadow-2xl">
              <img
                src={image || "https://picsum.photos/seed/therapist-profile/800/1000"}
                alt={name}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            {/* Decorative element */}
            <div className="absolute -bottom-6 -right-6 -z-10 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default ProfileHero
