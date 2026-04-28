import * as React from "react"
import { motion } from "motion/react"
import { Button } from "../components/ui/Button"
import { Link } from "react-router-dom"
import { Compass } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#FFFBE7]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-8 max-w-lg"
      >
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-primary/10 rounded-full blur-3xl" />
          <Compass className="w-24 h-24 text-primary relative mx-auto" />
        </div>
        
        <div className="space-y-4">
          <h1 className="text-5xl md:text-6xl text-primary font-serif">Lost your way?</h1>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Even the most intentional journeys have unexpected turns. Let's find your path back.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <Button asChild size="lg" className="rounded-full px-8">
            <Link to="/">Return to Home</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-8">
            <Link to="/therapists">Find a Saarthi</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
