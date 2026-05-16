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

interface DravinaProfileProps {
  onBookClick?: () => void;
}

const DravinaProfile = ({ onBookClick }: DravinaProfileProps) => {
  const dravinaData = {
    name: "Dravina Gupta",
    title: "Therapist | Psychologist",
    location: "Delhi, India",
    languages: ["Hindi", "English"],
    experience: "1+ years",
    shortIntro: "Psychologist with a focus on identifying psychological patterns and supporting clients with practical, structured approaches.",
    aboutContent: [
      "Hi, I am Dravina Gupta, a psychologist with a background in Clinical Psychology. I have completed both my graduation and post-graduation in this field and work with individuals dealing with a range of emotional and psychological concerns.",
      "I specialize in areas such as anger management, stress, anxiety, depression, and workplace-related challenges. My work involves identifying psychological patterns, understanding individual concerns through observation and conversation, and supporting clients with practical approaches.",
      "I am known for being a patient listener with strong analytical skills and an empathetic approach. I focus on understanding each individual’s situation deeply and helping them navigate their personal challenges in a structured and supportive manner.",
      "I am committed to using my knowledge and experience to support individuals in improving their mental well-being."
    ],
    specializations: [
      "Anger Management",
      "Anxiety",
      "Depression",
      "Stress & Burnout",
      "Workplace Issues",
      "Family Concerns",
      "Teen & Child Support",
      "Employee Mental Health (EAP)"
    ],
    qualifications: [
      {
        degree: "Master’s in Clinical Psychology",
        institution: "",
        year: ""
      },
      {
        degree: "Bachelor’s in Psychology",
        institution: "",
        year: ""
      }
    ]
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "Dravina Gupta",
    "jobTitle": "Psychologist",
    "worksFor": {
      "@type": "Organization",
      "name": "Saarthi"
    },
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Delhi",
      "addressCountry": "India"
    }
  }

  return (
    <main className="bg-background">
      <Helmet>
        <title>Dravina Gupta | Psychologist in Delhi | Saarthi</title>
        <meta name="description" content="Consult Dravina Gupta, a psychologist in Delhi specializing in anxiety, stress, depression, and workplace issues. Book online therapy sessions with Saarthi." />
        <link rel="canonical" href="https://saarthilife.com/therapists/dravina" />
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      </Helmet>
      <ProfileHero 
        name={dravinaData.name}
        title={dravinaData.title}
        location={dravinaData.location}
        languages={dravinaData.languages}
        experience={dravinaData.experience}
        shortIntro={dravinaData.shortIntro}
        image="/about_page.png"
        onBookClick={onBookClick}
      />
      
      <AboutSection content={dravinaData.aboutContent} />
      
      <Specializations items={dravinaData.specializations} />
      
      <Qualifications items={dravinaData.qualifications} />
      
      <Approach items={[
        "Acceptance & Commitment Therapy (ACT)",
        "Cognitive Behavioral Therapy (CBT)",
        "Solution Focused Brief Therapy (SFBT)",
        "Emotion-Focused Therapy",
        "Mindfulness"
      ]} />
      
      <TherapistProcess />
      
      <SessionDetails mode="Online Sessions" clients={["Individual", "Couple", "Family", "Teen"]} />
      
      <FinalCTA onBookClick={onBookClick} />
    </main>
  )
}

export default DravinaProfile
