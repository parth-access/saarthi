import * as React from "react"
import { Helmet } from "react-helmet-async"
import { motion } from "motion/react"
import { Button } from "../components/ui/Button"
import { Link } from "react-router-dom"
import { Heart, Shield, Sparkles, MessageCircle, Compass, Anchor, Sun, Wind, Quote, Users } from "lucide-react"

const Vision = () => {
  const pillars = [
    {
      icon: <Wind className="w-5 h-5" />,
      title: "Quiet Sanctuary",
      description: "A calm and comfortable space where you can take a moment for yourself."
    },
    {
      icon: <Compass className="w-5 h-5" />,
      title: "Gentle Guidance",
      description: "Support that walks with you, not ahead of you."
    },
    {
      icon: <Users className="w-5 h-5" />,
      title: "Cultural Empathy",
      description: "Understanding your background, your story, and what matters to you."
    },
    {
      icon: <Sun className="w-5 h-5" />,
      title: "Holistic Growth",
      description: "Helping you grow with clarity, balance, and confidence."
    }
  ]

  return (
    <div className="pt-32 pb-24 bg-background min-h-screen selection:bg-primary/10 overflow-x-hidden">
      <Helmet>
        <title>Our Vision | Normalizing Mental Well-being | Saarthi</title>
        <meta name="description" content="Explore Saarthi’s vision to normalize mental health conversations and provide accessible, judgment-free psychological support." />
        <link rel="canonical" href="https://saarthilife.com/vision" />
      </Helmet>
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[10%] -left-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-[20%] -right-20 w-[30rem] h-[30rem] bg-accent/5 rounded-full blur-3xl opacity-50" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-[0.02] bg-[url('https://www.transparenttextures.com/patterns/paper-fibers.png')]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section 1: Our Vision Hero */}
        <section className="mb-32">
          <div className="max-w-4xl">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="flex items-center gap-4 mb-8"
            >
              <div className="h-px w-12 bg-accent/40" />
              <span className="text-accent font-medium tracking-[0.3em] uppercase text-xs">Our Vision</span>
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              className="text-5xl md:text-7xl lg:text-8xl text-primary leading-[0.85] tracking-tighter mb-12"
            >
              Our Vision — <br />
              <span className="italic font-normal text-accent/80">Making Emotional Well-being Simple</span>
            </motion.h1>
            
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.5 }}
              className="space-y-6 max-w-2xl"
            >
              <p className="text-xl md:text-2xl text-primary/70 leading-relaxed font-serif italic">
                Saarthi is built to make emotional well-being feel simple, natural, and accessible.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                A space where understanding yourself feels comfortable, not complicated.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Section 2: Vision Statement (Moved Up) */}
        <section className="mb-48">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2 }}
              className="relative"
            >
              <div className="aspect-[4/5] rounded-[4rem] overflow-hidden shadow-2xl">
                <img 
                  src="vision_page.png" 
                  alt="Visionary landscape" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              {/* <div className="absolute -bottom-8 -right-8 w-48 h-48 bg-accent rounded-full flex items-center justify-center text-white shadow-xl rotate-12 p-8 text-center">
                <p className="text-sm font-serif italic">"Building a world where people feel safe to grow."</p>
              </div> */}
            </motion.div>

            <div className="space-y-12">
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="space-y-6"
              >
                <span className="text-accent font-medium tracking-widest uppercase text-xs">The Future We See</span>
                <h2 className="text-4xl md:text-6xl text-primary leading-tight">
                  A world where <br />
                  <span className="italic font-normal text-accent">well-being is normal.</span>
                </h2>
              </motion.div>

              <div className="space-y-10">
                <p className="text-xl text-muted-foreground leading-relaxed">
                  We envision a world where taking care of your mental well-being feels normal and accessible.
                </p>
                <p className="text-lg text-muted-foreground/80 leading-relaxed">
                  A world where people feel comfortable expressing themselves and growing without hesitation.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Belief Statement (Smaller, not dramatic) */}
        <section className="mb-48">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="p-12 md:p-16 rounded-[4rem] bg-white border border-primary/5 shadow-sm hover:shadow-xl transition-all duration-500"
            >
              <span className="text-accent font-medium tracking-widest uppercase text-xs mb-6 block">Our Belief</span>
              <h2 className="text-4xl md:text-5xl font-serif text-primary mb-8 italic">Feeling understood should be natural</h2>
              <div className="space-y-6 max-w-2xl mx-auto text-lg text-muted-foreground leading-relaxed">
                <p>
                  We believe emotional well-being should feel simple and approachable.
                </p>
                <p>
                  Support should feel comfortable, not overwhelming.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Section 4: The Saarthi Way */}
        <section className="mb-48">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="space-y-4"
            >
              <span className="text-accent font-medium tracking-widest uppercase text-xs">The Saarthi Way</span>
              <h2 className="text-4xl md:text-6xl text-primary">Our Pillars of Care</h2>
            </motion.div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pillars.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-8 rounded-[3rem] bg-white border border-primary/5 shadow-sm hover:shadow-xl transition-all duration-500 group"
              >
                <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary mb-6 group-hover:bg-accent/10 group-hover:text-accent transition-all">
                  {item.icon}
                </div>
                <h3 className="text-xl font-bold text-primary mb-3">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Section 5: Closing Section */}
        <section className="text-center pb-20">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto space-y-16"
          >
            <div className="space-y-6">
              <span className="text-accent font-medium tracking-widest uppercase text-xs">Your Journey Matters</span>
              <h2 className="text-5xl md:text-8xl text-primary leading-tight">
                Every Step <br />
                <span className="italic font-normal text-accent">Matters.</span>
              </h2>
              <div className="space-y-8">
                <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-2xl mx-auto font-serif italic">
                  Every step you take towards understanding yourself matters.
                </p>
                <div className="flex justify-center items-center gap-4 text-primary/40">
                  <Quote className="w-8 h-8 rotate-180" />
                  <p className="text-2xl md:text-3xl text-primary font-serif italic max-w-xl">
                    Mental wellness isn't a destination you reach; it's a way of traveling.
                  </p>
                  <Quote className="w-8 h-8" />
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-center gap-8">
              <Button asChild size="lg" className="h-20 px-16 text-xl rounded-[2rem] shadow-2xl shadow-primary/20 hover:shadow-accent/30 transition-all hover:-translate-y-2 bg-primary hover:bg-primary/95">
                <Link to="/therapists">Find Your Saarthi</Link>
              </Button>
              <p className="text-muted-foreground text-sm tracking-widest uppercase">We’re here whenever you’re ready.</p>
            </div>
          </motion.div>
        </section>

      </div>

      {/* Custom Scroll Progress (Subtle) */}
      <motion.div 
        className="fixed top-0 left-0 right-0 h-1 bg-accent/20 origin-left z-[60]"
        style={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
      />
    </div>
  )
}

export default Vision

