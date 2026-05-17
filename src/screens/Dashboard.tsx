"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { motion } from "motion/react";
import { 
  Calendar, CheckCircle, Clock, Search, LogOut, 
  MapPin, Activity, FileText, ChevronRight, UserCog
} from "lucide-react";
import Link from "next/link";
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase/client";
import { Booking, Therapist } from "../types";

export default function Dashboard() {
  const { currentUser, logout } = useAuth();
  const [upcomingSessions, setUpcomingSessions] = useState<Booking[]>([]);
  const [pastSessions, setPastSessions] = useState<Booking[]>([]);
  const [therapists, setTherapists] = useState<Record<string, Therapist>>({});
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    if (!currentUser) return;
    
    const fetchDashboardData = async () => {
      try {
        // Fetch User Profile
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          setUserProfile(userDoc.data());
        }

        // Fetch User Bookings
        // Note: the schema in bookingService stores bookings in 'bookings' collection.
        // I need to ensure there is a way to query by email or we need to add uid if possible. Let's query by email since that's what was collected during booking.
        const bookingsRef = collection(db, 'bookings');
        const q = query(
          bookingsRef, 
          where('email', '==', currentUser.email), // Assuming booking was made with same email
          orderBy('date', 'desc')
        );
        
        const snap = await getDocs(q);
        const allBookings = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
        
        const nowStr = new Date().toISOString().split('T')[0];
        
        const upcoming = allBookings.filter(b => 
          (b.status === 'confirmed' || b.status === 'pending' || b.status === 'awaiting_payment') && 
          b.date >= nowStr
        );
        
        const past = allBookings.filter(b => 
          b.status === 'completed' || b.status === 'cancelled' || b.status === 'rejected' || b.date < nowStr
        ).slice(0, 5); // Just a few past sessions
        
        setUpcomingSessions(upcoming);
        setPastSessions(past);
        
        // Extract unique therapist IDs
        const tIds = new Set<string>();
        allBookings.forEach(b => tIds.add(b.therapistId));
        
        // Fetch therapist details
        const tMap: Record<string, Therapist> = {};
        for (const tId of Array.from(tIds)) {
          const tDoc = await getDoc(doc(db, 'therapists', tId));
          if (tDoc.exists()) {
            tMap[tId] = { id: tDoc.id, ...tDoc.data() } as Therapist;
          }
        }
        setTherapists(tMap);
        
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDashboardData();
  }, [currentUser]);

  const [reconnecting, setReconnecting] = useState<string | null>(null);

  const handleReconnect = async (therapistId: string, therapistName: string) => {
    setReconnecting(therapistId);
    try {
      const res = await fetch('/api/reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser?.uid,
          userEmail: currentUser?.email,
          userName: userProfile?.name || currentUser?.email?.split('@')[0],
          therapistId,
          therapistName
        })
      });
      if (!res.ok) throw new Error("Failed to send request");
      alert("Reconnect request sent to admin. We will contact you soon.");
    } catch (err) {
      alert("Failed to send reconnect request. Please try again or contact support.");
    } finally {
      setReconnecting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-32 pb-24 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 pb-24 bg-[#FFFBE7]">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12">
          <div>
            <h1 className="text-3xl font-serif text-primary mb-2">
              Hello, {userProfile?.name || currentUser?.email?.split('@')[0]}
            </h1>
            <p className="text-muted-foreground text-sm">
              Manage your sessions, track your progress, and continue your journey.
            </p>
          </div>
          <button 
            onClick={logout}
            className="mt-4 md:mt-0 flex items-center gap-2 px-4 py-2 text-sm text-primary/70 hover:text-primary transition-colors hover:bg-black/5 rounded-full"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Upcoming Sessions */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-medium text-primary flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Upcoming Sessions
                </h2>
                <Link href="/dashboard/bookings" className="text-sm text-primary/70 hover:text-primary hover:underline">
                  View All
                </Link>
              </div>

              {upcomingSessions.length === 0 ? (
                <div className="bg-white/50 border border-primary/10 rounded-2xl p-8 text-center text-sm text-primary/70">
                  <p className="mb-4">You have no upcoming sessions.</p>
                  <Link href="/therapists" className="inline-flex items-center justify-center rounded-full text-sm font-medium transition-colors bg-[#E6A520] text-white hover:bg-[#E6A520]/90 h-10 px-6 py-2">
                    Book a Session
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingSessions.map(session => (
                    <motion.div key={session.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-primary/10 rounded-2xl p-6 shadow-sm">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-xs uppercase tracking-widest text-[#E6A520] font-bold mb-1">
                            {session.sessionType} Session
                          </p>
                          <h3 className="font-medium text-lg text-primary">{therapists[session.therapistId]?.name || "Your Therapist"}</h3>
                        </div>
                        <span className="px-3 py-1 bg-primary/5 text-primary text-xs rounded-full uppercase tracking-wider font-medium">
                          {session.status.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap gap-4 text-sm text-primary/70">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-primary/40" />
                          {session.date}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-primary/40" />
                          {session.time}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Activity className="w-4 h-4 text-primary/40" />
                          {session.paymentStatus || 'unpaid'}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </section>

            {/* Past Sessions */}
            <section>
              <h2 className="text-xl font-medium text-primary mb-6 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Recent History
              </h2>

              {pastSessions.length === 0 ? (
                <div className="bg-white/50 border border-primary/10 rounded-2xl p-8 text-center text-sm text-primary/70">
                  <p>Your previous sessions will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pastSessions.map(session => (
                    <div key={session.id} className="bg-white/50 border border-primary/5 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm text-primary">{therapists[session.therapistId]?.name || "Therapist"}</p>
                        <p className="text-xs text-primary/60">{session.date} — {session.status}</p>
                      </div>
                      <Link href="/dashboard/bookings" className="text-primary/40 hover:text-primary transition-colors" aria-label={`View booking ${session.id}`}>
                        <ChevronRight className="w-5 h-5" />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            
            {/* Quick Actions */}
            <section className="bg-white rounded-[2rem] p-8 border border-primary/10 shadow-sm">
              <h2 className="text-lg font-medium text-primary mb-6">Quick Actions</h2>
              <div className="space-y-4">
                <Link href="/therapists" className="flex items-center gap-3 text-sm text-primary/80 hover:text-primary hover:bg-black/5 p-2 -mx-2 rounded-xl transition-colors">
                  <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center">
                    <Search className="w-4 h-4" />
                  </div>
                  Find a Therapist
                </Link>
                <Link href="/dashboard/receipts" className="flex items-center gap-3 text-sm text-primary/80 hover:text-primary hover:bg-black/5 p-2 -mx-2 rounded-xl transition-colors">
                  <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  View Receipts
                </Link>
                <Link href="/contact" className="flex items-center gap-3 text-sm text-primary/80 hover:text-primary hover:bg-black/5 p-2 -mx-2 rounded-xl transition-colors">
                  <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center">
                    <UserCog className="w-4 h-4" />
                  </div>
                  Contact Support
                </Link>
              </div>
            </section>

            {/* My Therapists */}
            <section className="bg-white rounded-[2rem] p-8 border border-primary/10 shadow-sm">
              <h2 className="text-lg font-medium text-primary mb-6">My Therapists</h2>
              {Object.values(therapists).length === 0 ? (
                <p className="text-xs text-primary/60">You haven't interacted with any therapists yet.</p>
              ) : (
                <div className="space-y-6">
                  {Object.values(therapists).map(t => (
                    <div key={t.id} className="group">
                      <div className="flex items-center gap-4 mb-3">
                        {t.image ? (
                          <img src={t.image} alt={t.name} className="w-12 h-12 rounded-full object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-serif">
                            {t.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm text-primary">{t.name}</p>
                          <p className="text-xs text-primary/60 truncate max-w-[140px]">{t.specialization}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleReconnect(t.id, t.name)}
                        disabled={reconnecting === t.id}
                        className={`w-full text-xs font-medium uppercase tracking-wider transition-colors border rounded-xl py-2 ${
                          reconnecting === t.id 
                            ? 'text-primary/40 border-primary/10 cursor-wait' 
                            : 'text-[#E6A520] hover:text-primary border-[#E6A520]/20 hover:border-primary/20'
                        }`}
                      >
                        {reconnecting === t.id ? 'Sending...' : 'Reconnect'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          
        </div>
      </div>
    </div>
  );
}
