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

export function JoinTeamCard() {
  return (
    <Card className="h-full flex flex-col items-center justify-center p-12 text-center border border-dashed border-muted rounded-[1.75rem] bg-sage/50">
      <div className="h-20 w-20 rounded-full bg-surface flex items-center justify-center mb-6">
        <ShieldCheck className="w-10 h-10 text-primary/40" />
      </div>
      <h3 className="text-2xl font-serif text-primary-ink mb-2">Join our Team</h3>
      <p className="text-muted-foreground text-sm mb-8 leading-relaxed">Are you a psychologist? <br/>Help us redefine well-being.</p>
      <Button asChild variant="outline" className="px-8">
        <Link href="/contact">Enquire about joining</Link>
      </Button>
    </Card>
  );
}

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
    <div className="pt-32 pb-24 bg-background min-h-screen bg-[radial-gradient(70%_40%_at_50%_0%,#E9EFEA,transparent)]">      
      <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-8">
        <div className="mb-20 text-center space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 bg-surface px-4 py-1.5 rounded-full text-xs font-medium tracking-wide text-primary border border-muted"
          >
            <ShieldCheck className="w-3 h-3" /> Our Verified Team
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-6xl lg:text-7xl text-primary-ink font-serif font-medium leading-[1.05] tracking-tight"
          >
            Find Your <br />
            <span className="italic font-normal text-accent">Saarthi.</span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-serif italic"
          >
            Connect with specialist professionals who walk beside you on your path to clarity.
          </motion.p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
            <p className="text-sm font-sans font-medium text-primary/60">Connecting you with our clinical care network...</p>
          </div>
        ) : (
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {therapists.map((therapist, index) => (
                <motion.div
                  key={therapist.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="group"
                >
                  <Card className="h-full flex flex-col overflow-hidden border border-muted bg-surface transition-all duration-500 hover:border-primary/25 hover:-translate-y-1 hover:shadow-[0_24px_50px_-30px_rgba(38,68,58,0.35)] rounded-[1.75rem]">
                    <div className="relative h-80 overflow-hidden">
                      {therapist.image ? (
                        <>
                          <img
                            src={therapist.image.startsWith('http') || therapist.image.startsWith('/') ? therapist.image : `/${therapist.image}`}
                            alt={therapist.name}
                            className="w-full h-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:scale-[1.03] saturate-[.88] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(246,247,243,0)_55%,rgba(38,68,58,0.10)),rgba(200,165,114,0.06)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)] pointer-events-none" />
                        </>
                      ) : (
                        <div aria-hidden="true" className="w-full h-full bg-gradient-to-br from-primary/10 to-accent/10" />
                      )}
                    </div>
                    <CardHeader className="p-8">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-accent bg-accent-soft/60 px-2.5 py-0.5 rounded-full">{therapist.specialization}</span>
                          <span className="text-xs font-medium text-primary bg-sage px-2.5 py-0.5 rounded-full">Verified M.A. Clinical Psych</span>
                        </div>
                        <CardTitle className="text-3xl font-serif text-primary-ink group-hover:text-primary transition-colors">{therapist.name}</CardTitle>
                        <CardDescription className="text-muted-foreground line-clamp-3 leading-relaxed italic text-base">
                          &ldquo;{therapist.bio}&rdquo;
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="p-8 pt-0 mt-auto">
                      <div className="flex items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <ShieldCheck className="h-4 w-4" /> {therapist.experience || '1+ Years'} Exp.
                        </div>
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <MapPin className="h-4 w-4" /> Online
                        </div>
                      </div>
                      {(() => {
                        const cta = getTherapistCtaDetails(therapist);
                        return (
                          <Button 
                            asChild 
                            className="w-full h-12 group/btn text-base shadow-[0_18px_40px_-34px_rgba(38,68,58,0.35)]"
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
               initial={{ opacity: 0, y: 12 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: therapists.length * 0.1 }}
            >
                <JoinTeamCard />
            </motion.div>
          </div>
        )}
      </div>
    </div>
  )
}
