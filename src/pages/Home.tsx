import * as React from "react"
import { Helmet } from "react-helmet-async"
import Hero from "../components/home/Hero"
import Services from "../components/home/Services"
import FeaturedTherapist from "../components/home/FeaturedTherapist"
import Process from "../components/home/Process"
import CTA from "../components/home/CTA"
import { ContactForm } from "../components/forms/ContactForm"

interface HomeProps {
  onBookClick?: () => void;
}

const Home = ({ onBookClick }: HomeProps) => {
  return (
    <main>
      <Helmet>
        <title>Saarthi | Online Therapy & Mental Wellness Support India</title>
        <meta name="description" content="Saarthi provides professional online therapy and psychology consultations for anxiety, stress, and emotional well-being. Find clarity and heal." />
        <link rel="canonical" href="https://saarthilife.com/" />
      </Helmet>
      <Hero onBookClick={onBookClick} />
      <Services />
      <FeaturedTherapist />
      <Process />
      
      <section id="contact" className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-text mb-4 italic">Get in Touch</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Have questions about our services or want to learn more? Send us a message and we'll get back to you.
            </p>
          </div>
          <ContactForm />
        </div>
      </section>

      <CTA onBookClick={onBookClick} />
    </main>
  )
}

export default Home
