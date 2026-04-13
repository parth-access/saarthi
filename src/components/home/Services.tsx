import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/Card"
import { Shield, Heart, Briefcase, Users } from "lucide-react"
import { motion } from "motion/react"

const services = [
  {
    title: "Anxiety Support",
    description: "Personalized strategies to manage anxiety and reclaim control over your life.",
    icon: <Shield className="h-8 w-8 text-primary" />,
  },
  {
    title: "Stress Management",
    description: "Practical tools to navigate stress and build resilience in everyday life.",
    icon: <Heart className="h-8 w-8 text-primary" />,
  },
  {
    title: "Career Guidance",
    description: "Clarity and direction for your professional journey and career transitions.",
    icon: <Briefcase className="h-8 w-8 text-primary" />,
  },
  {
    title: "Relationship Guidance",
    description: "Building healthy connections and navigating relationship challenges.",
    icon: <Users className="h-8 w-8 text-primary" />,
  },
]

const Services = () => {
  return (
    <section id="services" className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-primary font-serif">Our Services</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            We offer a range of psychology-based consultation services to support your emotional clarity and mental wellness.
          </p>
        </div>
        
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, index) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card className="h-full border-none shadow-none hover:bg-background/50">
                <CardHeader>
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5">
                    {service.icon}
                  </div>
                  <CardTitle className="text-xl font-serif">{service.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base text-muted-foreground">
                    {service.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Services
