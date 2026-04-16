import * as React from "react"
import { Helmet } from "react-helmet-async"
import { motion } from "motion/react"
import { MapPin, ArrowRight } from "lucide-react"
import { Button } from "../components/ui/Button"
import { Link } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/Card"

const Therapists = () => {
  const therapists = [
    {
      name: "Dravina Gupta",
      role: "Therapist | Psychologist",
      location: "Delhi, India",
      image: "/Gemini_Generated_Image_1q2v1m1q2v1m1q2v.png",
      route: "/therapists/dravina",
      isPlaceholder: false,
    },
    {
      name: "You can be here",
      role: "Join Saarthi and help people with mental health",
      location: "Global",
      image: "https://picsum.photos/seed/join/400/400",
      route: "#join",
      isPlaceholder: true,
    },
  ]

  return (
    <div className="pt-32 pb-24 bg-background min-h-screen">
      <Helmet>
        <title>Our Therapists | Find Your Saarthi for Mental Health</title>
        <meta name="description" content="Browse qualified therapists at Saarthi and find the right support for anxiety, stress, relationships, and emotional well-being." />
        <link rel="canonical" href="https://saarthilife.com/therapists" />
      </Helmet>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-bold text-primary font-serif mb-4"
          >
            Find Your Saarthi
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            Connect with certified professionals who understand your journey and provide a safe space for growth.
          </motion.p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {therapists.map((therapist, index) => (
            <motion.div
              key={therapist.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 + 0.2 }}
            >
              <Card className="h-full flex flex-col overflow-hidden group">
                <div className="relative h-64 overflow-hidden">
                  <img
                    src={therapist.image}
                    alt={therapist.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-primary/10" />
                </div>
                <CardHeader className="p-6">
                  <CardTitle className="text-2xl mb-1">{therapist.name}</CardTitle>
                  <CardDescription className="text-accent font-medium italic mb-4">
                    {therapist.role}
                  </CardDescription>
                  {!therapist.isPlaceholder && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 text-accent" />
                      <span>{therapist.location}</span>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-6 pt-0 mt-auto">
                  {therapist.isPlaceholder ? (
                    <Button variant="outline" className="w-full group/btn">
                      Join as Therapist
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                    </Button>
                  ) : (
                    <Button asChild className="w-full group/btn">
                      <Link to={therapist.route}>
                        Know Your Saarthi
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Therapists
