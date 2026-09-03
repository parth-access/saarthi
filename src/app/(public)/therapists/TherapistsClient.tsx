"use client";


import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MapPin, ArrowRight, ShieldCheck, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/Button"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card"
import { Therapist } from "@/types"
import { therapistService } from "@/services/therapistService"
import { trackEvent } from "@/lib/analytics"
import { DEFAULT_THERAPISTS, getTherapistCtaDetails } from "@/constants/therapists"

export default function TherapistsPage() {
  const [therapists, setTherapists] = React.useState<Therapist[]>(DEFAULT_THERAPISTS)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const fetched = await therapistService.getTherapists()
        if (active) {
          if (fetched && fetched.length > 0) {
            setTherapists(fetched)
          } else {
            setTherapists(DEFAULT_THERAPISTS)
          }
        }
      } catch (err) {
        console.error("Failed to load therapists dynamically, falling back to static team list:", err)
        if (active) {
          setTherapists(DEFAULT_THERAPISTS)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="pt-32 pb-24 bg-background min-h-screen selection:bg-primary/10">      
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
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-8 h-8 text-[#E6A520] animate-spin" />
            <p className="text-sm font-sans font-medium text-primary/60">Connecting you with our clinical care network...</p>
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
                      {therapist.image ? (
                        <>
                          <img
                            src={therapist.image.startsWith('http') || therapist.image.startsWith('/') ? therapist.image : `/${therapist.image}`}
                            alt={therapist.name}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 grayscale group-hover:grayscale-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                        </>
                      ) : (
                        <div aria-hidden="true" className="w-full h-full bg-gradient-to-br from-primary/10 to-accent/10" />
                      )}
                    </div>
                    <CardHeader className="p-8">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase font-black tracking-widest text-accent bg-accent/10 px-2.5 py-0.5 rounded-full">{therapist.specialization}</span>
                          <span className="text-[10px] font-semibold text-primary/70 bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">Verified M.A. Clinical Psych</span>
                        </div>
                        <CardTitle className="text-3xl font-serif text-primary group-hover:text-accent transition-colors">{therapist.name}</CardTitle>
                        <CardDescription className="text-muted-foreground line-clamp-3 leading-relaxed italic text-base">
                          &ldquo;{therapist.bio}&rdquo;
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="p-8 pt-0 mt-auto">
                      <div className="flex items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-2 text-xs font-black text-primary/60 uppercase tracking-tighter">
                          <ShieldCheck className="h-4 w-4" /> {therapist.experience || '1+ Years'} Exp.
                        </div>
                        <div className="flex items-center gap-2 text-xs font-black text-primary/60 uppercase tracking-tighter">
                          <MapPin className="h-4 w-4" /> Online
                        </div>
                      </div>
                      {(() => {
                        const cta = getTherapistCtaDetails(therapist);
                        return (
                          <Button 
                            asChild 
                            className="w-full h-14 rounded-2xl group/btn bg-primary hover:bg-primary/95 text-base font-bold shadow-xl shadow-primary/10"
                            onClick={() => {
                              if (cta.isProfile) {
                                trackEvent('view_therapist_profile', {
                                  location: 'therapists_directory',
                                  therapist_id: therapist.id,
                                  therapist_slug: therapist.slug || 'dravina',
                                  therapist_name: therapist.name,
                                });
                              } else {
                                trackEvent('book_session_click', {
                                  location: 'therapists_directory',
                                  therapist_id: therapist.id,
                                  therapist_name: therapist.name,
                                });
                              }
                            }}
                          >
                            <Link href={cta.href}>
                              {cta.label}
                              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                            </Link>
                          </Button>
                        );
                      })()}
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
                    <ShieldCheck className="w-10 h-10 text-primary/20" />
                  </div>
                  <h3 className="text-2xl font-serif text-primary mb-2">Join our Team</h3>
                  <p className="text-muted-foreground text-sm mb-8 leading-relaxed">Are you a licensed psychologist? <br/>Help us redefine well-being.</p>
                  <Button asChild variant="outline" className="rounded-full px-8 hover:bg-primary hover:text-white transition-all">
                    <Link href="/contact">Apply Now</Link>
                  </Button>
               </Card>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  )
}
