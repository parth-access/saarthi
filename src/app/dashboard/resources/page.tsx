"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, BookOpen, Wind, Heart, Anchor, Smile } from "lucide-react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { BreathingPlayer, type BreathingPattern } from "@/components/dashboard/BreathingPlayer";

const EXERCISES: BreathingPattern[] = [
  {
    id: "box-breathing",
    title: "Box Breathing",
    desc: "A steady four-count rhythm that settles a racing mind. Four equal sides, over and over.",
    color: "bg-[#FFFBE7]",
    phases: [
      { label: "Breathe in", seconds: 4 },
      { label: "Hold", seconds: 4 },
      { label: "Breathe out", seconds: 4 },
      { label: "Hold", seconds: 4 },
    ],
  },
  {
    id: "4-7-8",
    title: "4-7-8 Relaxation",
    desc: "A longer exhale tips your body towards rest. Helpful when sleep feels far away.",
    color: "bg-emerald-50",
    phases: [
      { label: "Breathe in", seconds: 4 },
      { label: "Hold", seconds: 7 },
      { label: "Breathe out", seconds: 8 },
    ],
  },
];

const MOODS: { emoji: string; label: string; affirmation: string }[] = [
  { emoji: "😞", label: "Low", affirmation: "Heaviness is allowed to exist without being explained. Be gentle with today's pace." },
  { emoji: "😟", label: "Anxious", affirmation: "Your body is trying to protect you. A slow exhale is enough of a first step." },
  { emoji: "😐", label: "Flat", affirmation: "Not every day needs a feeling. Neutral is a resting place, not a failure." },
  { emoji: "🙂", label: "Okay", affirmation: "Steady counts. Notice one small thing that helped you get here." },
  { emoji: "😊", label: "Good", affirmation: "Let this land properly — good days are worth noticing on purpose." },
];

const GROUNDING = [
  { count: "5", sense: "things you can see", hint: "Name them slowly — the light, a colour, the edge of the room." },
  { count: "4", sense: "things you can feel", hint: "Your feet on the floor, fabric on your arms, the chair behind you." },
  { count: "3", sense: "things you can hear", hint: "Traffic, a fan, your own breathing." },
  { count: "2", sense: "things you can smell", hint: "Or two smells you like, if there's nothing in the air." },
  { count: "1", sense: "thing you can taste", hint: "Or one taste you're looking forward to." },
];

const REFLECTION_PROMPTS = [
  "What took the most out of me this week, and what gave something back?",
  "If I could hand one worry to someone else for a day, which would it be?",
  "What do I want my next session to make room for?",
  "When did I last feel like myself, and what was happening around me?",
];

function Wellness() {
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const [mood, setMood] = useState<number | null>(null);

  return (
    <div className="pt-24 pb-24 px-4 sm:px-6">
      <div className="container mx-auto max-w-5xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-primary/60 hover:text-primary mb-8 transition-colors group font-sans"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to dashboard
        </Link>

        <div className="mb-10 font-sans">
          <h1 className="text-3xl sm:text-4xl font-serif text-primary">Wellness corner</h1>
          <p className="text-sm text-primary/60 mt-2 max-w-2xl leading-relaxed">
            A few things you can do right now, in this tab, between sessions. Nothing here is
            recorded or shared — it runs on your screen and disappears when you leave.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Breathing — a real guided timer, one open at a time */}
            <section aria-labelledby="breathing-heading" className="bg-white border border-primary/10 rounded-[2rem] p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-1">
                <Wind className="w-5 h-5 text-[#E6A520]" />
                <h2 id="breathing-heading" className="text-xl font-serif text-primary">Guided breathing</h2>
              </div>
              <p className="text-sm text-primary/60 font-sans mb-6">
                Pick a rhythm and the timer will pace you through it.
              </p>

              <div className="space-y-4">
                {EXERCISES.map((exercise) => {
                  const isOpen = openExercise === exercise.id;
                  return (
                    <div key={exercise.id} className={`rounded-3xl border border-primary/10 ${exercise.color} p-5`}>
                      <button
                        type="button"
                        onClick={() => setOpenExercise(isOpen ? null : exercise.id)}
                        aria-expanded={isOpen}
                        className="w-full text-left cursor-pointer group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="font-serif text-lg text-primary">{exercise.title}</h3>
                            <p className="text-xs text-primary/60 mt-1 leading-relaxed font-sans max-w-md">{exercise.desc}</p>
                            <p className="text-[11px] uppercase tracking-widest text-primary/40 mt-2 font-sans">
                              {exercise.phases.map((p) => p.seconds).join(" · ")} seconds
                            </p>
                          </div>
                          <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-white/70 border border-primary/10 rounded-full px-3 py-1.5 font-sans group-hover:bg-white transition-colors">
                            {isOpen ? "Close" : "Practise"}
                          </span>
                        </div>
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <BreathingPlayer pattern={exercise} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </section>
            {/* Grounding — static content, honestly presented as something to read and do */}
            <section aria-labelledby="grounding-heading" className="bg-white border border-primary/10 rounded-[2rem] p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-1">
                <Anchor className="w-5 h-5 text-[#E6A520]" />
                <h2 id="grounding-heading" className="text-xl font-serif text-primary">The 5-4-3-2-1 grounding walk</h2>
              </div>
              <p className="text-sm text-primary/60 font-sans mb-6 leading-relaxed">
                When your thoughts are moving faster than you are, this pulls attention back into the
                room through your senses. Work down the list at your own speed.
              </p>
              <ol className="space-y-3 font-sans">
                {GROUNDING.map((step) => (
                  <li key={step.count} className="flex items-start gap-4 p-4 rounded-2xl bg-[#FFFBE7]/70 border border-primary/5">
                    <span className="w-9 h-9 shrink-0 rounded-full bg-white border border-primary/10 flex items-center justify-center font-serif text-lg text-[#E6A520]">
                      {step.count}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-primary">{step.sense}</p>
                      <p className="text-xs text-primary/55 mt-1 leading-relaxed">{step.hint}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* Reflection prompts — no storage, and it says so rather than implying a journal */}
            <section aria-labelledby="reflection-heading" className="bg-white border border-primary/10 rounded-[2rem] p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-1">
                <BookOpen className="w-5 h-5 text-[#E6A520]" />
                <h2 id="reflection-heading" className="text-xl font-serif text-primary">Questions worth sitting with</h2>
              </div>
              <p className="text-sm text-primary/60 font-sans mb-6 leading-relaxed">
                Saarthi doesn&apos;t store journals, so there&apos;s nothing to save here. Write these
                wherever you already write, or bring one to your next session as a starting point.
              </p>
              <ul className="space-y-3 font-sans">
                {REFLECTION_PROMPTS.map((prompt) => (
                  <li key={prompt} className="p-4 rounded-2xl border border-primary/10 bg-[#FFFBE7]/50 text-sm text-primary/80 leading-relaxed">
                    &ldquo;{prompt}&rdquo;
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <aside className="space-y-6">
            {/* Mood check-in — local only, and labelled as such */}
            <section aria-labelledby="mood-heading" className="bg-white border border-primary/10 rounded-[2rem] p-6 shadow-sm">
              <div className="flex items-center gap-2.5 mb-1">
                <Smile className="w-5 h-5 text-[#E6A520]" />
                <h2 id="mood-heading" className="text-lg font-serif text-primary">How are you, right now?</h2>
              </div>
              <p className="text-xs text-primary/55 font-sans mb-5 leading-relaxed">
                Just for you — this isn&apos;t saved or sent to your therapist.
              </p>
              <div className="flex items-center justify-between gap-1" role="group" aria-label="Choose how you feel">
                {MOODS.map((m, index) => (
                  <button
                    key={m.label}
                    type="button"
                    onClick={() => setMood(mood === index ? null : index)}
                    aria-pressed={mood === index}
                    title={m.label}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all cursor-pointer ${
                      mood === index
                        ? "border-[#E6A520] bg-[#FFFBE7] shadow-sm"
                        : "border-transparent hover:bg-black/[0.03]"
                    }`}
                  >
                    <span className="text-xl" aria-hidden="true">{m.emoji}</span>
                    <span className="text-[10px] font-medium text-primary/60 font-sans">{m.label}</span>
                  </button>
                ))}
              </div>
              <AnimatePresence initial={false}>
                {mood !== null && (
                  <motion.p
                    key={mood}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-5 p-4 rounded-2xl bg-[#FFFBE7]/70 border border-primary/5 text-sm text-primary/75 leading-relaxed font-sans"
                  >
                    {MOODS[mood].affirmation}
                  </motion.p>
                )}
              </AnimatePresence>
            </section>

            {/* Real routes only: the live therapist directory and the booking flow */}
            <section className="rounded-[2rem] bg-primary text-white p-6 shadow-sm">
              <Heart className="w-6 h-6 text-[#E6A520] mb-3" />
              <h2 className="text-lg font-serif mb-2">Some things need a person</h2>
              <p className="text-sm text-white/70 leading-relaxed font-sans mb-5">
                Breathing helps in the moment. If something keeps coming back, talk it through with a
                therapist who can hold the whole picture.
              </p>
              <div className="space-y-2.5 font-sans">
                <Link
                  href="/book"
                  className="w-full inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-white text-primary text-sm font-semibold hover:bg-white/90 transition-colors"
                >
                  Book a session
                </Link>
                <Link
                  href="/therapists"
                  className="w-full inline-flex items-center justify-center px-5 py-2.5 rounded-full border border-white/25 text-white text-sm font-medium hover:bg-white/10 transition-colors"
                >
                  Meet the therapists
                </Link>
              </div>
            </section>

            <p className="text-xs text-primary/50 leading-relaxed font-sans px-2">
              If you&apos;re in immediate danger or thinking about harming yourself, please contact
              your local emergency number or the Tele-MANAS helpline on{" "}
              <a href="tel:14416" className="font-medium text-primary underline hover:text-[#E6A520]">14416</a>{" "}
              (India, 24×7). Saarthi isn&apos;t a crisis service.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function ResourcesRoute() {
  return (
    <ProtectedRoute allowedRoles={["client", "admin"]}>
      <Wellness />
    </ProtectedRoute>
  );
}
