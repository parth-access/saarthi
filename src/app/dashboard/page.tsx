"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Calendar, CheckCircle, Clock, Search, LogOut, 
  Activity, FileText, ChevronRight, UserCog, Video, CreditCard, Sparkles, HelpCircle
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { collection, query, where, getDocs, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Booking, Therapist } from "@/types";
import { SessionDetailsModal } from "@/components/dashboard/SessionDetailsModal";
import { RescheduleModal } from "@/components/dashboard/RescheduleModal";
import { SupportModal } from "@/components/dashboard/SupportModal";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "sonner";
import { User } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

interface UserProfile {
  name?: string;
  phone?: string;
  bio?: string;
}

function Dashboard() {
  const { currentUser, logout } = useAuth();
  const [upcomingSessions, setUpcomingSessions] = useState<Booking[]>([]);
  const [pastSessions, setPastSessions] = useState<Booking[]>([]);
  const [therapists, setTherapists] = useState<Record<string, Therapist>>({});
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [pendingRescheduleIds, setPendingRescheduleIds] = useState<Set<string>>(new Set());

  // Modals state
  const [selectedSession, setSelectedSession] = useState<Booking | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [supportInitialMessage, setSupportInitialMessage] = useState("");
  const [supportInitialSubject, setSupportInitialSubject] = useState("General Support");

  useEffect(() => {
    if (!currentUser) return;
    
    const fetchDashboardData = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          setUserProfile(userDoc.data());
        }

        const bookingsRef = collection(db, 'bookings');
        const q = query(
          bookingsRef, 
          where('email', '==', currentUser.email),
          orderBy('date', 'desc')
        );
        
        const snap = await getDocs(q);
        const allBookings = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
        
        const nowStr = new Date().toISOString().split('T')[0];
        
        const upcoming = allBookings.filter(b => 
          (b.status === 'confirmed' || b.status === 'pending' || b.status === 'awaiting_payment' || b.status === 'pending_approval') && 
          b.date >= nowStr
        );
        
        const past = allBookings.filter(b => 
          b.status === 'completed' || b.status === 'cancelled' || b.status === 'rejected' || b.date < nowStr
        ).slice(0, 5);
        
        setUpcomingSessions(upcoming);
        setPastSessions(past);
        
        const tIds = new Set<string>();
        allBookings.forEach(b => tIds.add(b.therapistId));
        
        const tMap: Record<string, Therapist> = {};
        for (const tId of Array.from(tIds)) {
          const tDoc = await getDoc(doc(db, 'therapists', tId));
          if (tDoc.exists()) {
            tMap[tId] = { id: tDoc.id, ...tDoc.data() } as Therapist;
          }
        }
        setTherapists(tMap);

        // Fetch user's pending reschedule requests to flag sessions accordingly
        const resRef = collection(db, 'reschedule_requests');
        const rq = query(resRef, where('userId', '==', currentUser.uid), where('status', '==', 'pending'));
        const rSnap = await getDocs(rq);
        const rescheduleIds = new Set(rSnap.docs.map(doc => doc.data().bookingId));
        setPendingRescheduleIds(rescheduleIds);
        
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
      toast.success("Reconnect request sent quietly. We will contact you soon.");
    } catch {
      toast.error("Failed to send reconnect request. Please try again later.");
    } finally {
      setReconnecting(null);
    }
  };

  const handleRescheduleSubmit = async (reason: string, preferredDate: string, preferredTime: string) => {
    if (!selectedSession) return;
    
    const res = await fetch('/api/reschedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser?.uid,
        userEmail: currentUser?.email,
        userName: currentUser?.email?.split('@')[0],
        therapistId: selectedSession.therapistId,
        bookingId: selectedSession.id,
        reason,
        preferredDate,
        preferredTime
      })
    });
    if (!res.ok) throw new Error("Failed to send request");
    
    // Add to pending reschedule list immediately in local state
    setPendingRescheduleIds(prev => {
      const updated = new Set(prev);
      updated.add(selectedSession.id);
      return updated;
    });

    toast.success("Reschedule request submitted successfully.");
  };

  const getStatusClasses = (status: string) => {
    if (status === 'confirmed') return 'bg-emerald-50 text-emerald-600 border-emerald-100 font-sans';
    if (status === 'pending') return 'bg-amber-50 text-amber-600 border-amber-100 font-sans';
    if (status.includes('pending')) return 'bg-blue-50 text-blue-600 border-blue-100 font-sans';
    if (status === 'rejected') return 'bg-red-50 text-red-600 border-red-100 font-sans';
    if (status === 'cancelled') return 'bg-gray-50 text-gray-500 border-gray-100 font-sans';
    return 'bg-primary/5 text-primary border-primary/10 font-sans';
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-32 pb-24 bg-[#FFFBE7]">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
            <div className="space-y-4 w-full max-w-md">
              <Skeleton className="h-10 w-3/4 rounded-2xl" />
              <Skeleton className="h-5 w-1/2 rounded-xl" />
            </div>
            <Skeleton className="h-10 w-28 rounded-full shrink-0" />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-8">
               <Skeleton className="h-8 w-48 rounded-xl mb-6" />
               <Skeleton className="h-40 w-full rounded-3xl" />
               <Skeleton className="h-40 w-full rounded-3xl" />
            </div>
            <div className="lg:col-span-4 space-y-8">
               <Skeleton className="h-64 w-full rounded-3xl" />
               <Skeleton className="h-48 w-full rounded-3xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 pb-24 bg-[#FFFBE7]">
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-serif text-primary mb-2">
              Hello, {userProfile?.name || currentUser?.email?.split('@')[0]}
            </h1>
            <p className="text-primary/60 text-sm sm:text-base">
              Manage your sessions, track your progress, and continue your journey.
            </p>
          </div>
          <button 
            onClick={logout}
            className="flex flex-shrink-0 items-center gap-2 px-5 py-2.5 text-sm font-medium text-primary bg-white border border-primary/10 hover:bg-black/5 hover:border-primary/20 transition-colors rounded-full shadow-sm cursor-pointer font-sans"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Main Content */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* Upcoming Sessions */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl sm:text-2xl font-serif text-primary flex items-center gap-2">
                  <Calendar className="w-6 h-6 text-primary/60" />
                  Upcoming Sessions
                </h2>
                <Link href="/dashboard/bookings" className="text-sm font-medium text-[#E6A520] hover:text-[#c48b1a] transition-colors font-sans font-sans">
                  View All
                </Link>
              </div>

              {upcomingSessions.length === 0 ? (
                <div className="bg-white rounded-3xl border border-primary/10 p-10 text-center shadow-sm font-sans">
                  <div className="w-16 h-16 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Calendar className="w-8 h-8 text-primary/40" />
                  </div>
                  <p className="text-primary/70 mb-6 font-medium">🌿 Your schedule is clear. Take a breather before your next session.</p>
                  <Link href="/therapists" className="inline-flex items-center justify-center rounded-2xl text-sm font-medium transition-colors bg-[#E6A520] text-white hover:bg-[#E6A520]/90 px-8 py-3 shadow-sm cursor-pointer">
                    Book a Session
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingSessions.map(session => {
                    const t = therapists[session.therapistId];
                    return (
                      <motion.div 
                        key={session.id} 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => {
                          setSelectedSession(session);
                          setIsDetailsOpen(true);
                        }}
                        className="group bg-white border border-primary/10 hover:border-primary/20 rounded-3xl p-6 sm:p-8 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer text-left"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
                          <div className="flex gap-4 items-center sm:items-start">
                            {t?.image ? (
                              <div className="relative w-14 h-14 rounded-full overflow-hidden shrink-0 border border-primary/10">
                                <Image src={t.image} alt={t.name} fill className="object-cover" referrerPolicy="no-referrer" />
                              </div>
                            ) : (
                              <div className="w-14 h-14 rounded-full bg-primary/5 flex items-center justify-center text-primary font-serif text-xl shrink-0 border border-primary/10">
                                {t?.name.charAt(0) || "T"}
                              </div>
                            )}
                            <div>
                              <p className="text-xs uppercase tracking-widest text-[#E6A520] font-bold mb-1 font-sans">
                                {session.sessionType} Session
                              </p>
                              <h3 className="font-medium text-lg sm:text-xl text-primary">{t?.name || "Assigned Therapist"}</h3>
                              <p className="text-sm text-primary/60 font-sans">{t?.specialization || "Therapist"}</p>
                            </div>
                          </div>
                          <div className="self-start">
                            <span className={`px-3 py-1 text-xs rounded-full uppercase tracking-wider font-medium border ${getStatusClasses(session.status)}`}>
                              {session.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-x-6 gap-y-3 py-4 border-y border-primary/5 text-sm text-primary/70 mb-4 bg-[#FFFBE7]/30 -mx-6 sm:-mx-8 px-6 sm:px-8 font-sans">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-primary/40" />
                            <span className="font-medium text-primary">{session.date}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-primary/40" />
                            <span className="font-medium text-primary">{session.time}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Video className="w-4 h-4 text-primary/40" />
                            <span className="capitalize">{session.sessionMode || 'Video Call'}</span>
                          </div>
                          <div className="flex items-center gap-2 ml-auto">
                            <CreditCard className="w-4 h-4 text-primary/40" />
                            <span className={`capitalize font-medium ${session.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-[#E6A520]'}`}>
                              {session.paymentStatus || 'unpaid'}
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-end items-center text-sm font-medium text-primary/40 group-hover:text-[#E6A520] transition-colors font-sans">
                          View details <ChevronRight className="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform duration-300" />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Past Sessions */}
            <section>
              <h2 className="text-xl sm:text-2xl font-serif text-primary mb-6 flex items-center gap-2">
                <CheckCircle className="w-6 h-6 text-primary/60" />
                Recent History
              </h2>

              {pastSessions.length === 0 ? (
                <div className="bg-white/50 border border-primary/10 rounded-3xl p-8 text-center text-sm text-primary/70 shadow-sm font-sans">
                  <p>🌱 Your wellness journey will be documented here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pastSessions.map(session => {
                    const t = therapists[session.therapistId];
                    return (
                      <div 
                        key={session.id} 
                        onClick={() => {
                          setSelectedSession(session);
                          setIsDetailsOpen(true);
                        }}
                        className="bg-white border border-primary/10 hover:border-primary/20 rounded-2xl p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:shadow-sm hover:-translate-y-0.5 transition-all duration-300 group"
                      >
                        <div className="flex items-center gap-4">
                          {t?.image ? (
                            <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0 border border-primary/10 animate-fade-in">
                              <Image src={t.image} alt={t.name} fill className="object-cover" referrerPolicy="no-referrer" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center text-primary font-serif shrink-0 border border-primary/10">
                              {t?.name.charAt(0) || "T"}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-sm sm:text-base text-primary mb-0.5">{t?.name || "Assigned Therapist"}</p>
                            <p className="text-xs text-primary/60 flex items-center gap-2 font-sans">
                              {session.date} 
                              <span className={`w-1.5 h-1.5 rounded-full ${session.status === 'completed' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                              <span className="capitalize">{session.status}</span>
                            </p>
                          </div>
                        </div>
                        <div className="text-primary/40 group-hover:text-[#E6A520] transition-colors bg-primary/5 group-hover:bg-[#E6A520]/10 p-2 rounded-full">
                          <ChevronRight className="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform duration-300" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4 space-y-8 font-sans">
            
            {/* Quick Actions */}
            <section className="bg-white rounded-3xl p-6 sm:p-8 border border-primary/10 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-10" />
              <h2 className="text-lg font-serif text-primary mb-6">Quick Actions</h2>
              <div className="space-y-2">
                <Link href="/therapists" className="flex items-center gap-4 text-sm font-medium text-primary/80 hover:text-primary hover:bg-[#FFFBE7] p-3 rounded-2xl transition-all border border-transparent hover:border-primary/10 group">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Search className="w-4 h-4 text-[#E6A520]" />
                  </div>
                  Find a Therapist
                </Link>
                <Link href="/dashboard/profile" className="flex items-center gap-4 text-sm font-medium text-primary/80 hover:text-primary hover:bg-[#FFFBE7] p-3 rounded-2xl transition-all border border-transparent hover:border-primary/10 group">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                    <User className="w-4 h-4 text-[#E6A520]" />
                  </div>
                  Edit Profile
                </Link>
                <Link href="/dashboard/receipts" className="flex items-center gap-4 text-sm font-medium text-primary/80 hover:text-primary hover:bg-[#FFFBE7] p-3 rounded-2xl transition-all border border-transparent hover:border-primary/10 group">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FileText className="w-4 h-4 text-[#E6A520]" />
                  </div>
                  View Receipts
                </Link>
                <Link href="/dashboard/resources" className="flex items-center gap-4 text-sm font-medium text-primary/80 hover:text-primary hover:bg-[#FFFBE7] p-3 rounded-2xl transition-all border border-transparent hover:border-primary/10 group">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Activity className="w-4 h-4 text-[#E6A520]" />
                  </div>
                  Wellness Hub
                </Link>
                <Link href="/contact" className="flex items-center gap-4 text-sm font-medium text-primary/80 hover:text-primary hover:bg-[#FFFBE7] p-3 rounded-2xl transition-all border border-transparent hover:border-primary/10 group">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                    <UserCog className="w-4 h-4 text-[#E6A520]" />
                  </div>
                  Contact Support
                </Link>
              </div>
            </section>

            {/* My Therapists */}
            <section className="bg-white rounded-3xl p-6 sm:p-8 border border-primary/10 shadow-sm text-left">
              <h2 className="text-lg font-serif text-primary mb-6">My Therapists</h2>
              {Object.values(therapists).length === 0 ? (
                <div className="bg-primary/5 rounded-2xl p-6 text-center">
                  <p className="text-sm text-primary/60">🌿 Find a guide to support your journey.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.values(therapists).map(t => (
                    <div key={t.id} className="group bg-[#FFFBE7]/50 rounded-2xl p-4 border border-primary/5 hover:border-primary/10 transition-all text-left">
                      <div className="flex items-center gap-4 mb-4">
                        {t.image ? (
                          <div className="relative w-12 h-12 rounded-full overflow-hidden shrink-0 border border-primary/10">
                            <Image src={t.image} alt={t.name} fill className="object-cover" referrerPolicy="no-referrer" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-primary/5 flex items-center justify-center text-primary font-serif shrink-0 border border-primary/10">
                            {t.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm text-primary mb-0.5">{t.name}</p>
                          <p className="text-xs text-primary/60 truncate max-w-[140px]">{t.specialization}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleReconnect(t.id, t.name)}
                        disabled={reconnecting === t.id}
                        className={`w-full text-xs font-medium uppercase tracking-wider transition-all border rounded-xl py-2.5 cursor-pointer ${
                          reconnecting === t.id 
                            ? 'bg-primary/5 text-primary/40 border-transparent cursor-wait' 
                            : 'bg-white text-[#E6A520] hover:bg-[#E6A520] hover:text-white border-[#E6A520]/20'
                        }`}
                      >
                        {reconnecting === t.id ? 'Sending Request...' : 'Request Connection'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          
        </div>
      </div>

      <SessionDetailsModal 
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        session={selectedSession}
        therapist={selectedSession ? therapists[selectedSession.therapistId] : undefined}
        onReschedule={() => setIsRescheduleOpen(true)}
      />

      <RescheduleModal 
        isOpen={isRescheduleOpen}
        onClose={() => setIsRescheduleOpen(false)}
        session={selectedSession}
        onSubmit={handleRescheduleSubmit}
      />
    </div>
  );
}

export default function DashboardRoute() {
  return (
    <ProtectedRoute allowedRoles={['client', 'admin']}>
      <Dashboard />
    </ProtectedRoute>
  );
}
