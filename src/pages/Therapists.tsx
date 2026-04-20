import * as React from "react"
import { Helmet } from "react-helmet-async"
import { motion, AnimatePresence } from "motion/react"
import { MapPin, ArrowRight, Loader2, AlertCircle, ShieldCheck } from "lucide-react"
import { Button } from "../components/ui/Button"
import { Link } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/Card"
import { Therapist } from "../types"

const Therapists = () => {
  const [therapists, setTherapists] = React.useState<Therapist[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const fetchTherapists = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/get-therapists')
        const data = await res.json()
        if (data.success) {
          setTherapists(data.therapists || [])
        } else {
          setError(data.error || "Failed to load therapists.")
        }
      } catch (err) {
        console.error("Fetch error:", err)
        setError("Network error. Please try again later.")
      } finally {
        setLoading(false)
      }
    }
    fetchTherapists()
  }, [])

  return (
    <div className="pt-32 pb-24 bg-background min-h-screen selection:bg-primary/10">
      <Helmet>
        <title>Our Therapists | Find Your Saarthi for Mental Health</title>
        <meta name="description" content="Browse qualified therapists at Saarthi and find the right support for anxiety, stress, relationships, and emotional well-being." />
        <link rel="canonical" href="https://saarthilife.com/therapists" />
      </Helmet>
      
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-20 text-center space-y-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 bg-primary/5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-primary/60 border border-primary/10"
          >
            <ShieldCheck className="w-3 h-3" /> Our Verified Team
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl lg:text-8xl text-primary font-serif leading-[0.85] tracking-tighter"
          >
            Find Your <br />
            <span className="italic font-normal text-accent/80">Saarthi.</span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-muted-foreground max-w-2xl mx-auto italic font-serif"
          >
            Connect with specialist professionals who walk beside you on your path to clarity.
          </motion.p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-40 text-muted-foreground">
            <Loader2 className="h-12 w-12 animate-spin mb-4 text-primary/30" />
            <p className="font-serif text-lg italic animate-pulse">Gathering our specialists...</p>
          </div>
        ) : error ? (
          <div className="text-center py-32 max-w-md mx-auto space-y-6">
            <AlertCircle className="w-16 h-16 text-red-500/30 mx-auto" />
            <div className="space-y-2">
              <p className="text-2xl font-serif text-primary">{error}</p>
              <p className="text-muted-foreground">This might be due to a temporary connection issue.</p>
            </div>
            <Button onClick={() => window.location.reload()} variant="outline" className="rounded-full px-8">
              Refresh Page
            </Button>
          </div>
        ) : therapists.length === 0 ? (
          <div className="text-center py-40 bg-primary/5 rounded-[4rem] border-2 border-dashed border-primary/10">
            <h3 className="text-3xl font-serif text-primary/40 mb-2">No active therapists found</h3>
            <p className="text-muted-foreground">We are currently transitioning our therapist schedules. Please check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {therapists.map((therapist, index) => (
                <motion.div
                  key={therapist.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="group"
                >
                  <Card className="h-full flex flex-col overflow-hidden border-2 border-primary/5 bg-white transition-all duration-500 hover:border-primary/20 hover:shadow-2xl hover:shadow-primary/5 rounded-[3rem]">
                    <div className="relative h-80 overflow-hidden">
                      <img
                        src={therapist.image || "https://picsum.photos/400/600"}
                        alt={therapist.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 grayscale group-hover:grayscale-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                    </div>
                    <CardHeader className="p-8">
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase font-black tracking-widest text-accent">{therapist.specialization}</p>
                        <CardTitle className="text-3xl font-serif text-primary group-hover:text-accent transition-colors">{therapist.name}</CardTitle>
                        <CardDescription className="text-muted-foreground line-clamp-3 leading-relaxed italic text-base">
                          "{therapist.bio}"
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="p-8 pt-0 mt-auto">
                      <div className="flex items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-2 text-xs font-black text-primary/60 uppercase tracking-tighter">
                          <ShieldCheck className="h-4 w-4" /> {therapist.experience} Exp.
                        </div>
                        <div className="flex items-center gap-2 text-xs font-black text-primary/60 uppercase tracking-tighter">
                          <MapPin className="h-4 w-4" /> Online
                        </div>
                      </div>
                      <Button asChild className="w-full h-14 rounded-2xl group/btn bg-primary hover:bg-primary/95 text-base font-bold shadow-xl shadow-primary/10">
                        <Link to={`/contact`}>
                          Book a Session
                          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {/* CTA for joining */}
            <motion.div
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{ delay: therapists.length * 0.1 }}
            >
               <Card className="h-full flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-primary/10 rounded-[3rem] bg-primary/[0.02]">
                  <div className="h-20 w-20 rounded-full bg-primary/5 flex items-center justify-center mb-6">
                    <Loader2 className="w-10 h-10 text-primary/20" />
                  </div>
                  <h3 className="text-2xl font-serif text-primary mb-2">Join our Team</h3>
                  <p className="text-muted-foreground text-sm mb-8 leading-relaxed">Are you a licensed psychologist? <br/>Help us redefine well-being.</p>
                  <Button variant="outline" className="rounded-full px-8 hover:bg-primary hover:text-white transition-all">
                    Apply Now
                  </Button>
               </Card>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Therapists
