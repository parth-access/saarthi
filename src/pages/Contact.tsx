import * as React from "react"
import { Helmet } from "react-helmet-async"
import { motion } from "motion/react"
import { Mail, MapPin, Calendar, ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"
import { ContactForm } from "../components/forms/ContactForm"

const Contact = () => {
  return (
    <div className="pt-32 pb-24 bg-background min-h-screen selection:bg-primary/10 overflow-x-hidden">
      <Helmet>
        <title>Contact Saarthi | Therapy & Mental Health Support</title>
        <meta name="description" content="Reach out to Saarthi for therapy sessions, queries, or guidance. We're here to support your mental wellness journey." />
        <link rel="canonical" href="https://saarthilife.com/contact" />
      </Helmet>

      {/* Background Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[10%] -left-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-[20%] -right-20 w-[30rem] h-[30rem] bg-accent/5 rounded-full blur-3xl opacity-50" />
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        
        {/* 1. Header Section */}
        <section className="text-center mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-6"
          >
            <h1 className="text-5xl md:text-7xl text-primary leading-tight tracking-tight">
              Contact Saarthi
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto font-serif italic leading-relaxed">
              If you have questions, need guidance, or want to understand how therapy works, feel free to reach out.
            </p>
          </motion.div>
        </section>

        <div className="grid lg:grid-cols-3 gap-16">
          {/* 2. Contact Information Section */}
          <div className="lg:col-span-1 space-y-12">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="space-y-8"
            >
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary shrink-0">
                  <Mail className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-primary mb-1">Email</h3>
                  <a href="mailto:healwithsaarthi@gmail.com" className="text-muted-foreground hover:text-accent transition-colors">
                    healwithsaarthi@gmail.com
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary shrink-0">
                  <MapPin className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-primary mb-1">Location</h3>
                  <p className="text-muted-foreground">Delhi, India</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary shrink-0">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-primary mb-1">Sessions</h3>
                  <p className="text-muted-foreground">Online & Offline (by appointment)</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* 3. Contact Form Section */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-primary/5 shadow-sm"
            >
              <ContactForm />
              
              {/* 4. CTA (optional but minimal) */}
              <div className="mt-10 pt-8 border-t border-primary/5 text-center">
                <p className="text-muted-foreground flex items-center justify-center gap-2">
                  Prefer booking directly? 
                  <Link to="/therapists" className="text-primary font-medium hover:text-accent transition-colors inline-flex items-center gap-1">
                    Book a session instead
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Contact
