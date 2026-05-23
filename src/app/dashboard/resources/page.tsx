"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, Wind, Heart, PlayCircle, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

function Resources() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");

  const categories = [
    { id: "all", label: "All Resources" },
    { id: "breathing", label: "Breathing Exercises" },
    { id: "journaling", label: "Journaling Prompts" },
    { id: "articles", label: "Wellness Articles" },
  ];

  const breathingExercises = [
    {
      id: "box-breathing",
      title: "Box Breathing",
      duration: "5 mins",
      desc: "Find immediate calm and focus with this simple four-count rhythm.",
      color: "bg-[#FFFBE7]",
    },
    {
      id: "4-7-8",
      title: "4-7-8 Relaxation",
      duration: "10 mins",
      desc: "Promote deep relaxation and better sleep.",
      color: "bg-emerald-50",
    }
  ];

  const articles = [
    {
      title: "Understanding Emotional Safety",
      readTime: "4 min read",
      category: "Wellness",
    },
    {
      title: "The Power of Sitting with Your Thoughts",
      readTime: "6 min read",
      category: "Mindfulness",
    },
    {
      title: "Navigating Transitions",
      readTime: "5 min read",
      category: "Growth",
    }
  ];

  return (
    <div className="min-h-screen pt-24 pb-24 bg-[#FFFBE7]">
      <div className="container mx-auto px-6 max-w-6xl">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-primary/60 hover:text-primary mb-8 transition-colors group cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Dashboard
        </button>

        <div className="mb-12">
          <h1 className="text-3xl md:text-5xl font-serif text-primary tracking-tight mb-4">
            Wellness Resources
          </h1>
          <p className="text-primary/70 text-lg max-w-2xl">
            A curated collection of tools, exercises, and insights designed to bring you calm, clarity, and balance.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-10 border-b border-primary/5 pb-4 font-sans">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveTab(c.id)}
              className={`px-5 py-2.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                activeTab === c.id
                  ? "bg-primary text-[#FFFBE7]"
                  : "bg-white text-primary/70 hover:bg-white/70 hover:text-primary shadow-sm border border-primary/5"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-8 space-y-12">
            
            {(activeTab === "all" || activeTab === "breathing") && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-serif text-primary flex items-center gap-3">
                    <Wind className="w-6 h-6 text-[#E6A520]" />
                    Breathing Exercises
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {breathingExercises.map((ex) => (
                    <motion.div
                      whileHover={{ y: -4 }}
                      key={ex.id}
                      className={`p-6 rounded-3xl border border-primary/10 shadow-sm relative overflow-hidden group cursor-pointer ${ex.color}`}
                    >
                      <div className="flex justify-between items-start mb-12">
                         <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-primary shadow-sm">
                            <Wind className="w-5 h-5" />
                         </div>
                         <span className="text-xs font-medium px-3 py-1 bg-white/50 rounded-full">{ex.duration}</span>
                      </div>
                      <h3 className="text-xl font-medium text-primary mb-2">{ex.title}</h3>
                      <p className="text-primary/60 text-sm leading-relaxed mb-6 font-sans">{ex.desc}</p>
                      
                      <div className="flex items-center gap-2 text-sm font-medium text-primary uppercase tracking-wider font-sans">
                         <PlayCircle className="w-5 h-5 text-[#E6A520] group-hover:scale-110 transition-transform" />
                         Begin Practice
                      </div>
                      
                      {/* Decorative gradient */}
                      <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/20 blur-3xl rounded-full" />
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {(activeTab === "all" || activeTab === "journaling") && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-serif text-primary flex items-center gap-3">
                    <BookOpen className="w-6 h-6 text-[#E6A520]" />
                    Guided Journaling
                  </h2>
                </div>
                <div className="bg-white rounded-3xl border border-primary/10 p-8 sm:p-10 shadow-sm relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-64 h-64 bg-[#E6A520]/5 rounded-bl-[100px] -z-0" />
                   <div className="relative z-10 max-w-xl">
                      <p className="text-xs font-bold tracking-widest text-[#E6A520] uppercase mb-3 font-sans">Daily Prompt</p>
                      <h3 className="text-2xl sm:text-3xl font-serif text-primary mb-4 leading-tight">
                        &ldquo;What is one thing you can let go of today that isn&apos;t serving you?&rdquo;
                      </h3>
                      <p className="text-primary/60 mb-8 font-sans">
                        Take a few minutes to reflect on this. You don&apos;t have to write perfectly, just honestly. 
                        Your reflections are entirely private and securely encrypted.
                      </p>
                      <button className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-full text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm w-fit cursor-pointer font-sans">
                        <Lock className="w-4 h-4" />
                        Start Writing Privately
                      </button>
                   </div>
                </div>
              </section>
            )}
            
          </div>

          <div className="lg:col-span-4 space-y-8 font-sans">
            <div className="bg-white rounded-3xl border border-primary/10 p-8 shadow-sm">
              <h3 className="font-serif text-xl text-primary mb-6">Curated Reads</h3>
              <div className="space-y-6">
                {articles.map((article, i) => (
                  <div key={i} className="group cursor-pointer">
                    <p className="text-xs text-[#E6A520] font-medium tracking-wider uppercase mb-1">{article.category}</p>
                    <h4 className="font-medium text-primary group-hover:underline decoration-primary/30 underline-offset-4 line-clamp-2">{article.title}</h4>
                    <p className="text-xs text-primary/40 mt-1">{article.readTime}</p>
                  </div>
                ))}
              </div>
              <button className="w-full mt-6 py-3 border border-primary/10 rounded-2xl text-sm font-medium text-primary hover:bg-[#FFFBE7] transition-colors cursor-pointer">
                View All Articles
              </button>
            </div>

            <div className="bg-primary text-[#FFFBE7] rounded-3xl p-8 relative overflow-hidden font-sans">
               <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#FFFBE7]/10 blur-3xl rounded-full" />
               <Heart className="w-8 h-8 text-[#E6A520] mb-6" />
               <h3 className="font-serif text-2xl mb-3">Need to talk?</h3>
               <p className="text-white/70 text-sm mb-8 leading-relaxed">
                 Resources are helpful, but sometimes you just need another human. Our therapists are here when you&apos;re ready.
               </p>
               <button onClick={() => router.push("/therapists")} className="w-full py-3 bg-[#E6A520] text-primary font-medium text-sm rounded-xl hover:bg-[#c48b1a] transition-colors cursor-pointer">
                 Find a Therapist
               </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResourcesRoute() {
  return (
    <ProtectedRoute allowedRoles={['client', 'admin']}>
      <Resources />
    </ProtectedRoute>
  );
}
