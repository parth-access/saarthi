"use client";

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/Card"
import { MessagesSquare, Heart, Briefcase, Users, Presentation, GraduationCap, ChevronDown, ArrowRight, ArrowUpRight } from "lucide-react"
import { motion } from "framer-motion"

const services = [
  {
    title: "Teens and Individual Counselling",
    description: "One-on-one sessions for teenagers and adults, tailored to the concerns you are facing.",
    icon: <MessagesSquare className="h-6 w-6" />,
  },
  {
    title: "Stress and Anger Management",
    description: "Practical tools to manage stress and anger and build resilience in everyday life.",
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
];

// Shown under the main four when the arrow is opened. Each sits beneath the
// service it is drawn next to on desktop (columns 2 and 3).
const programmes = [
  {
    title: "Workshops",
    description: "Group sessions on emotional well-being for schools, colleges and workplaces.",
    icon: <Presentation className="h-6 w-6" />,
    href: "/contact",
    cta: "Enquire",
    external: false,
  },
  {
    title: "Saarthi Classes",
    // Wording from classes.saarthilife.com's own description.
    description: "Live small-batch psychology classes for Class 11, Class 12 and CUET-UG with Dravina Gupta.",
    icon: <GraduationCap className="h-6 w-6" />,
    href: "https://classes.saarthilife.com",
    cta: "Explore classes",
    external: true,
  },
]

const cardClass =
  "group h-full border-transparent bg-background p-7 shadow-none hover:-translate-y-[3px] hover:border-muted hover:bg-surface hover:shadow-[0_18px_40px_-28px_rgba(19,59,41,0.35)] motion-reduce:hover:translate-y-0"
const tileClass =
  "mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-sage text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-white"

const Services = () => {
  const [showProgrammes, setShowProgrammes] = React.useState(false)
  const panelId = React.useId()

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
              <Card className={cardClass}>
                <CardHeader>
                  <div className={tileClass}>
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
            className="flex h-12 w-12 items-center justify-center rounded-full border border-muted bg-surface text-primary shadow-[0_10px_24px_-14px_rgba(19,59,41,0.45)] transition-all duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] hover:translate-y-0.5 hover:border-primary hover:bg-primary hover:text-white motion-reduce:transition-colors motion-reduce:hover:translate-y-0"
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
            <div className="grid gap-6 pt-5 sm:grid-cols-2 lg:grid-cols-4">
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
                      <CardTitle className="text-xl font-serif text-text">{programme.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-[0.98rem] leading-7 text-muted-foreground">
                        {programme.description}
                      </CardDescription>
                      <Link
                        href={programme.href}
                        {...(programme.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="mt-3 inline-flex items-center gap-1.5 border-b border-accent/50 font-medium text-primary transition-[gap] duration-200 hover:gap-2.5"
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
