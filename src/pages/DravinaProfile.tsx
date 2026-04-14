import * as React from "react"
import { Helmet } from "react-helmet-async"
import { motion } from "motion/react"
import ProfileHero from "../components/therapist/ProfileHero"
import AboutSection from "../components/therapist/AboutSection"
import Specializations from "../components/therapist/Specializations"
import Qualifications from "../components/therapist/Qualifications"
import Approach from "../components/therapist/Approach"
import TherapistProcess from "../components/therapist/TherapistProcess"
import SessionDetails from "../components/therapist/SessionDetails"
import FinalCTA from "../components/therapist/FinalCTA"

const DravinaProfile = () => {
  const dravinaData = {
    name: "Dravina Gupta",
    title: "Therapist | Psychologist",
    location: "Delhi, India",
    languages: ["Hindi", "English"],
    experience: "1+ years",
    shortIntro: "Helping individuals navigate anxiety, stress, and emotional challenges with a safe, non-judgmental approach.",
    aboutContent: [
      "I’m a psychologist trained in Clinical Psychology, working with individuals navigating anxiety, stress, and emotional challenges.",
      "My approach focuses on creating a safe, non-judgmental space where you can explore your thoughts and emotions. Together, we work towards clarity, emotional strength, and healthier ways of coping."
    ],
    specializations: [
      "Anxiety & Stress",
      "Depression",
      "Emotional Regulation",
      "Workplace Stress",
      "Relationship Issues",
      "Self-Esteem"
    ],
    qualifications: [
      {
        degree: "M.A. Clinical Psychology",
        institution: "Amity University",
        year: "2023"
      },
      {
        degree: "B.A. Psychology (Hons)",
        institution: "Delhi University",
        year: "2021"
      }
    ]
  }

  return (
    <main className="bg-background">
      <Helmet>
        <title>Dravina Gupta | Psychologist & Therapist in Delhi | Saarthi</title>
        <meta name="description" content="Meet Dravina Gupta, a certified psychologist at Saarthi. Specializing in anxiety, stress, and depression therapy in Delhi. Book an online session today." />
        <link rel="canonical" href="https://saarthilife.com/therapists/dravina" />
      </Helmet>
      <ProfileHero 
        name={dravinaData.name}
        title={dravinaData.title}
        location={dravinaData.location}
        languages={dravinaData.languages}
        experience={dravinaData.experience}
        shortIntro={dravinaData.shortIntro}
      />
      
      <AboutSection content={dravinaData.aboutContent} />
      
      <Specializations items={dravinaData.specializations} />
      
      <Qualifications items={dravinaData.qualifications} />
      
      <Approach items={["CBT", "Humanistic", "Integrative", "Mindfulness"]} />
      
      <TherapistProcess />
      
      <SessionDetails mode="Online Sessions" clients={["Individuals", "Couples", "Young Adults"]} />
      
      <FinalCTA />
    </main>
  )
}

export default DravinaProfile
