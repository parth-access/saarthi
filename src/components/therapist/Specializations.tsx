import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/Card"
import { motion } from "motion/react"
import { Shield, Brain, Heart, Briefcase, Users, UserPlus, Sparkles, Smile } from "lucide-react"

interface SpecializationsProps {
  items: string[]
}

const icons = [
  <Shield className="h-6 w-6 text-primary" />,
  <Brain className="h-6 w-6 text-primary" />,
  <Heart className="h-6 w-6 text-primary" />,
  <Briefcase className="h-6 w-6 text-primary" />,
  <Users className="h-6 w-6 text-primary" />,
  <UserPlus className="h-6 w-6 text-primary" />,
  <Sparkles className="h-6 w-6 text-primary" />,
  <Smile className="h-6 w-6 text-primary" />,
]

const Specializations = ({ items }: SpecializationsProps) => {
  return (
    <section id="specializations" className="py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-primary font-serif">Specializations</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Areas of focus based on clinical experience and practice.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((spec, index) => (
            <motion.div
              key={spec}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
            >
              <Card className="h-full border-none shadow-none hover:bg-white/50 bg-white/30 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5">
                    {icons[index % icons.length]}
                  </div>
                  <CardTitle className="text-lg font-serif">{spec}</CardTitle>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Specializations
