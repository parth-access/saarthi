import * as React from "react"
import { Helmet } from "react-helmet-async"
import { motion } from "motion/react"
import { Button } from "../components/ui/Button"
import { Link } from "react-router-dom"
import { Heart, Shield, Sparkles, MessageCircle, Compass, Users, Lightbulb, Leaf } from "lucide-react"

const About = () => {
  const differentiators = [
    {
      icon: <Lightbulb className="w-6 h-6" />,
      title: "Expert Perspective",
      description: "A blend of professional psychology and a fresh, modern perspective on wellness."
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Emotional Safety",
      description: "A strong focus on emotional safety and comfort in every interaction."
    },
    {
      icon: <Heart className="w-6 h-6" />,
      title: "Warm Design",
      description: "A space designed to feel warm, minimal, and entirely non-intimidating."
    },
    {
      icon: <Sparkles className="h-6 w-6" />,
      title: "Empathetic Listening",
      description: "An approach that values listening over judging, prioritizing your experience."
    }
  ]

  return (
    <div className="pt-32 pb-24 bg-background min-h-screen selection:bg-primary/10 overflow-x-hidden">
      <Helmet>
        <title>About Saarthi | Our Mission, Vision & Founders</title>
        <meta name="description" content="Learn about Saarthi’s mission to make mental health support accessible through professional therapy and psychological guidance." />
        <link rel="canonical" href="https://saarthilife.com/about" />
      </Helmet>
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[10%] -left-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-[20%] -right-20 w-[30rem] h-[30rem] bg-accent/5 rounded-full blur-3xl opacity-50" />
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        
        {/* 1. Hero Section */}
        <section className="text-center mb-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-6"
          >
            <h1 className="text-5xl md:text-7xl lg:text-8xl text-primary leading-tight tracking-tight">
              About Saarthi — <br />
              <span className="italic font-normal text-accent/80">Your Safe Space.</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto font-serif italic leading-relaxed">
              A place where you feel heard, understood, and supported without judgment.
            </p>
          </motion.div>
        </section>

        {/* 2. About Section (A Pause in a Loud World) */}
        <section className="mb-32">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="space-y-8"
            >
              <h2 className="text-4xl text-primary">A Pause in a Loud World</h2>
              <div className="space-y-6 text-lg text-muted-foreground leading-relaxed">
                <p>
                  Saarthi was created with a simple yet powerful intention — to offer a space where you feel heard, understood, and supported without judgment. In a world that constantly demands more, Saarthi stands as a pause — a place where you can reconnect with yourself.
                </p>
                <p>
                  Created by a psychologist and a visionary partner, Saarthi brings together professional mental health expertise and a fresh, empathetic perspective. This balance allows us to understand emotional needs deeply, while providing support that feels human, gentle, and real.
                </p>
                <p>
                  Like its name, Saarthi (a guide), we aim to gently support you through your journey — not by leading, but by walking with you.
                </p>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="relative"
            >
              <div className="aspect-square rounded-[3rem] overflow-hidden shadow-2xl">
                <img 
                  src="about_page.png" 
                  alt="Calm meditation" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-accent/10 rounded-full blur-2xl -z-10" />
            </motion.div>
          </div>
        </section>

        {/* 3. What We Believe */}
        <section className="mb-32 text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="space-y-8"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 text-accent mb-4">
              <Leaf className="w-8 h-8" />
            </div>
            <h2 className="text-4xl text-primary italic font-serif">What We Believe</h2>
            <div className="space-y-4">
              <p className="text-xl text-muted-foreground leading-relaxed">
                At Saarthi, we believe that mental well-being is not a luxury — it is essential.
              </p>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Whether you are navigating stress, seeking clarity, or simply looking for a safe space to express yourself, we are here to walk beside you without judgment.
              </p>
            </div>
          </motion.div>
        </section>

        {/* 4. Mission & 5. Vision */}
        <section className="mb-32 grid md:grid-cols-2 gap-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="p-12 rounded-[3rem] bg-primary text-white space-y-6"
          >
            <span className="text-accent font-medium tracking-widest uppercase text-xs">Our Mission</span>
            <p className="text-primary-foreground/90 text-lg leading-relaxed">
              To create a safe, inclusive, and calming space where individuals can explore their thoughts, emotions, and personal growth with the right guidance and support.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="p-12 rounded-[3rem] bg-white border border-primary/5 space-y-6"
          >
            <span className="text-accent font-medium tracking-widest uppercase text-xs">Our Vision</span>
            <p className="text-muted-foreground text-lg leading-relaxed">
              To normalize conversations around mental health and make emotional well-being accessible, approachable, and stigma-free for everyone.
            </p>
          </motion.div>
        </section>

        {/* 6. What Makes Saarthi Different */}
        <section className="mb-32">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl text-primary mb-4">What Makes Saarthi Different</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-8">
            {differentiators.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-10 rounded-[2.5rem] bg-white border border-primary/5 hover:border-accent/30 transition-all duration-500 group"
              >
                <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary mb-6 group-hover:bg-accent/10 group-hover:text-accent transition-all">
                  {item.icon}
                </div>
                <h4 className="text-2xl font-bold text-primary mb-3">{item.title}</h4>
                <p className="text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* 7. Founders Section */}
        <section className="mb-32">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl text-primary mb-4">The Hearts Behind Saarthi</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center space-y-6 p-12 rounded-[3rem] bg-white border border-primary/5"
            >
              <div className="w-32 h-32 rounded-full bg-primary/5 mx-auto flex items-center justify-center">
                <Users className="w-12 h-12 text-primary opacity-40" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-primary">Dravina Gupta</h3>
                <p className="text-accent font-medium italic">Founder</p>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                A dedicated psychologist focused on understanding and supporting mental well-being with compassion and expertise.
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-center space-y-6 p-12 rounded-[3rem] bg-white border border-primary/5"
            >
              <div className="w-32 h-32 rounded-full bg-primary/5 mx-auto flex items-center justify-center">
                <Users className="w-12 h-12 text-primary opacity-40" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-primary">Krishna Gupta</h3>
                <p className="text-accent font-medium italic">Co-Founder</p>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Bringing a modern vision and business strategy, Krishna is passionate about building a safe and meaningful brand experience.
              </p>
            </motion.div>
          </div>
        </section>

      </div>
    </div>
  )
}

export default About

