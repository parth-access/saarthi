import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/Card"
import { MessagesSquare, Heart, Briefcase, Users } from "lucide-react"
import { motion } from "framer-motion"

const services = [
  {
    title: "Teams and Individual Consultation",
    description: "One-on-one and team sessions tailored to the concerns you or your workplace are facing.",
    icon: <MessagesSquare className="h-6 w-6" />,
  },
  {
    title: "Stress Management",
    description: "Practical tools to navigate stress and build resilience in everyday life.",
    icon: <Heart className="h-6 w-6" />,
  },
  {
    title: "Career Guidance",
    description: "Clarity and direction for your professional journey and career transitions.",
    icon: <Briefcase className="h-6 w-6" />,
  },
  {
    title: "Relationship Guidance",
    description: "Building healthy connections and navigating relationship challenges.",
    icon: <Users className="h-6 w-6" />,
  },
]

const Services = () => {
  return (
    <section id="services" className="py-24 md:py-32 bg-surface">
      <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-8">
        <div className="mb-14 md:mb-16 text-center">
          <h2 className="mb-4 text-primary-ink font-serif">Our Services</h2>
          <p className="mx-auto max-w-2xl text-[1.06rem] leading-8 text-muted-foreground">
            We offer a range of psychology-based consultation services to support your emotional clarity and mental wellness.
          </p>
        </div>
        
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, index) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: index * 0.07, ease: [0.22, 0.61, 0.36, 1] }}
            >
              <Card className="group h-full border-transparent bg-background p-7 shadow-none hover:-translate-y-[3px] hover:border-muted hover:bg-surface hover:shadow-[0_18px_40px_-28px_rgba(19,59,41,0.35)] motion-reduce:hover:translate-y-0">
                <CardHeader>
                  <div className="mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-sage text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-white">
                    {service.icon}
                  </div>
                  <CardTitle className="text-xl font-serif text-text">{service.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-[0.98rem] leading-7 text-muted-foreground">
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
