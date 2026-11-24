"use client";

import * as React from "react"
import Link from "next/link"
import { SAARTHI_CLASSES_URL } from "@/constants/links"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/Card"
import { MessagesSquare, Heart, Briefcase, Users, Presentation, GraduationCap, ChevronDown, ArrowRight, ArrowUpRight } from "lucide-react"
import { motion } from "framer-motion"

const services = [
  {
    title: "Teens and Individual Counselling",
    description: "One-on-one sessions for teenagers and adults, tailored to the concerns you are facing.",
    icon: <MessagesSquare className="h-8 w-8 text-primary" />,
  },
  {
    title: "Stress and Anger Management",
    description: "Practical tools to manage stress and anger and build resilience in everyday life.",
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
];

// Shown under the main four when the arrow is opened. Each sits beneath the
// service it is drawn next to on desktop (columns 2 and 3).
const programmes = [
  {
    title: "Workshops",
    description: "Group sessions on emotional well-being for schools, colleges and workplaces.",
    icon: <Presentation className="h-8 w-8 text-primary" />,
    href: "/contact",
    cta: "Enquire",
    external: false,
  },
  {
    title: "Saarthi Classes",
    // Wording from classes.saarthilife.com's own description.
    description: "Live small-batch psychology classes for Class 11, Class 12 and CUET-UG with Dravina Gupta.",
    icon: <GraduationCap className="h-8 w-8 text-primary" />,
    href: SAARTHI_CLASSES_URL,
    cta: "Explore classes",
    external: true,
  },
]

const cardClass =
  "group h-full border-none shadow-none transition-all duration-300 ease-out hover:bg-background/50 hover:-translate-y-1 hover:shadow-md motion-reduce:transition-colors motion-reduce:duration-150 motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-none"
const tileClass =
  "mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5 transition-all duration-300 ease-out group-hover:scale-110 group-hover:bg-primary/10 motion-reduce:transition-colors motion-reduce:group-hover:scale-100"

const Services = () => {
  const [showProgrammes, setShowProgrammes] = React.useState(false)
  const panelId = React.useId()

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
              <Card className={cardClass}>
                <CardHeader>
                  <div className={tileClass}>
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

        {/* Centred under the grid, so on desktop it sits on the gap between
            the 2nd and 3rd services. */}
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setShowProgrammes((open) => !open)}
            aria-expanded={showProgrammes}
            aria-controls={panelId}
            aria-label={showProgrammes ? "Hide Workshops and Saarthi Classes" : "Show Workshops and Saarthi Classes"}
            title={showProgrammes ? "Hide" : "Workshops & Saarthi Classes"}
            className="group/arrow flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-primary/25 bg-white text-primary shadow-[0_6px_16px_-8px_rgba(31,94,59,0.45)] transition-all duration-300 ease-out hover:translate-y-0.5 hover:border-primary hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 motion-reduce:transition-colors motion-reduce:hover:translate-y-0"
          >
            <ChevronDown
              aria-hidden="true"
              className={`h-[22px] w-[22px] transition-transform duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none ${
                showProgrammes ? "rotate-180" : "animate-[services-nudge_2.4s_ease-in-out_infinite] motion-reduce:animate-none"
              }`}
            />
          </button>
        </div>

        <div
          id={panelId}
          inert={!showProgrammes}
          className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none ${
            showProgrammes ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="grid gap-8 pt-5 sm:grid-cols-2 lg:grid-cols-4">
              {programmes.map((programme, index) => (
                <div
                  key={programme.title}
                  className={`transition-all duration-500 ease-out motion-reduce:transition-none ${
                    index === 0 ? "lg:col-start-2" : "lg:col-start-3"
                  } ${showProgrammes ? "translate-y-0 opacity-100" : "translate-y-2.5 opacity-0"}`}
                  style={{ transitionDelay: showProgrammes ? `${index * 80}ms` : "0ms" }}
                >
                  <Card className={cardClass}>
                    <CardHeader>
                      <div className={tileClass}>{programme.icon}</div>
                      <CardTitle className="text-xl font-serif">{programme.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-base text-muted-foreground">
                        {programme.description}
                      </CardDescription>
                      <Link
                        href={programme.href}
                        {...(programme.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="mt-3 inline-flex items-center gap-1.5 border-b border-accent/60 font-medium text-primary transition-[gap] duration-200 hover:gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      >
                        {programme.cta}
                        <span className="sr-only">
                          {programme.external ? " (opens classes.saarthilife.com in a new tab)" : ` about ${programme.title}`}
                        </span>
                        {programme.external ? (
                          <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                        ) : (
                          <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        )}
                      </Link>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Services
