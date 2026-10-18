"use client";

/**
 * Generic therapist profile, built from the therapist's own record (edited in
 * the admin console or by the therapist). Dravina keeps her hand-built page at
 * /therapists/dravina — that static route always takes precedence over this one.
 */
import * as React from "react"
import ProfileHero from "@/components/therapist/ProfileHero"
import AboutSection from "@/components/therapist/AboutSection"
import TherapistProcess from "@/components/therapist/TherapistProcess"
import SessionDetails from "@/components/therapist/SessionDetails"
import FinalCTA from "@/components/therapist/FinalCTA"

export interface PublicTherapistProfile {
  name: string
  specialization: string
  experience: string
  bio: string
  image: string
  bookingHref: string
  priceLabel: string
}

export default function TherapistProfileClient({ profile }: { profile: PublicTherapistProfile }) {
  const paragraphs = profile.bio
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  const intro = paragraphs[0] ?? `${profile.name} offers online sessions on Saarthi.`

  return (
    <main className="bg-background">
      <ProfileHero
        name={profile.name}
        title={profile.specialization || "Therapist"}
        location="Online · India"
        languages={[]}
        experience={profile.experience}
        shortIntro={intro.length > 220 ? `${intro.slice(0, 217).trimEnd()}…` : intro}
        image={profile.image || undefined}
        bookingHref={profile.bookingHref}
      />

      {paragraphs.length > 0 && <AboutSection content={paragraphs} />}

      <TherapistProcess />

      <SessionDetails mode={`Online Sessions · ${profile.priceLabel}`} clients={["Individual", "Couple", "Family", "Teen"]} />

      <FinalCTA bookingHref={profile.bookingHref} />
    </main>
  )
}
