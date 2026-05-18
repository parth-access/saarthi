"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Calendar, ChevronLeft, ChevronRight, Filter, Clock, Video, CreditCard } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { collection, query, where, getDocs, orderBy, getDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase/client";
import { Booking, Therapist } from "../types";
import { RescheduleModal } from "../components/dashboard/RescheduleModal";
import { SessionDetailsModal } from "../components/dashboard/SessionDetailsModal";

export default function DashboardBookings() {
  const { currentUser } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [therapists, setTherapists] = useState<Record<string, Therapist>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed' | 'cancelled' | 'rejected' | 'awaiting_payment'>('all');

  const [selectedSession, setSelectedSession] = useState<Booking | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    
    const fetchBookings = async () => {
      try {
        const bookingsRef = collection(db, 'bookings');
        const q = query(
          bookingsRef, 
          where('email', '==', currentUser.email),
          orderBy('date', 'desc')
        );
        
        const snap = await getDocs(q);
        const allBookings = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
        setBookings(allBookings);
        
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
        
      } catch (err) {
        console.error("Failed to load bookings:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchBookings();
  }, [currentUser]);

  const handleRescheduleSubmit = async (reason: string, preferredDate: string, preferredTime: string) => {
    if (!selectedSession || !currentUser) return;
    
    const res = await fetch('/api/reschedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.uid,
        userEmail: currentUser.email,
        userName: currentUser.email?.split('@')[0],
        therapistId: selectedSession.therapistId,
        bookingId: selectedSession.id,
        reason,
        preferredDate,
        preferredTime
      })
    });
    if (!res.ok) throw new Error("Failed to send request");
  };

  const nowStr = new Date().toISOString().split('T')[0];
  
  const filteredBookings = bookings.filter(b => {
    if (filter === 'upcoming') return b.date >= nowStr && b.status !== 'cancelled' && b.status !== 'rejected';
    if (filter === 'completed') return b.status === 'completed';
    if (filter === 'cancelled') return b.status === 'cancelled';
    if (filter === 'rejected') return b.status === 'rejected';
    if (filter === 'awaiting_payment') return b.status === 'awaiting_payment';
    return true; // all
  });

  const getStatusClasses = (status: string) => {
    if (status === 'confirmed') return 'bg-emerald-50 text-emerald-600 border-emerald-100';
    if (status === 'pending') return 'bg-amber-50 text-amber-600 border-amber-100';
    if (status.includes('pending')) return 'bg-blue-50 text-blue-600 border-blue-100';
    if (status === 'rejected') return 'bg-red-50 text-red-600 border-red-100';
    if (status === 'cancelled') return 'bg-gray-50 text-gray-500 border-gray-100';
    return 'bg-primary/5 text-primary border-primary/10';
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-32 pb-24 flex items-center justify-center bg-[#FFFBE7]">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 pb-24 bg-[#FFFBE7]">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="mb-8">
          <Link href="/dashboard" className="inline-flex items-center text-sm font-medium text-primary/60 hover:text-primary mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Dashboard
          </Link>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <h1 className="text-3xl sm:text-4xl font-serif text-primary">All Sessions</h1>
            
            <div className="flex flex-wrap bg-white rounded-3xl p-1.5 border border-primary/10 shadow-sm w-fit gap-1 sm:gap-2">
              {(['all', 'upcoming', 'completed', 'awaiting_payment', 'cancelled', 'rejected'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 xl:px-5 py-2 rounded-2xl text-xs sm:text-sm font-medium capitalize transition-all ${
                    filter === f ? 'bg-primary text-white shadow-sm' : 'text-primary/60 hover:text-primary hover:bg-black/5'
                  }`}
                >
                  {f.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white/50 border border-primary/10 rounded-[2.5rem] p-4 sm:p-8 shadow-sm">
          {filteredBookings.length === 0 ? (
            <div className="text-center py-16 text-primary/60 bg-white rounded-3xl border border-primary/5">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>🌿 Your wellness journey awaits. No {filter !== 'all' ? filter.replace('_', ' ') : ''} sessions found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredBookings.map(session => {
                const t = therapists[session.therapistId];
                return (
                  <div 
                    key={session.id} 
                    onClick={() => {
                        setSelectedSession(session);
                        setIsDetailsOpen(true);
                    }}
                    className="border border-primary/10 bg-white rounded-3xl p-6 sm:p-8 hover:border-primary/20 hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer group flex flex-col h-full"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
                      <div className="flex gap-4 items-center sm:items-start">
                        {t?.image ? (
                          <div className="relative w-12 h-12 rounded-full overflow-hidden shrink-0 border border-primary/10">
                            <Image src={t.image} alt={t.name} fill className="object-cover" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-primary/5 flex items-center justify-center text-primary font-serif shrink-0 border border-primary/10">
                            {t?.name.charAt(0) || "T"}
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] sm:text-xs uppercase tracking-widest text-[#E6A520] font-bold mb-1">
                            {session.sessionType} Session
                          </p>
                          <h3 className="font-medium text-base sm:text-lg text-primary">{t?.name || "Assigned Therapist"}</h3>
                        </div>
                      </div>
                      <div className="self-start relative top-0 sm:top-1.5 shrink-0">
                         <span className={`px-2.5 py-1 text-[10px] sm:text-xs rounded-full uppercase tracking-wider font-medium border ${getStatusClasses(session.status)}`}>
                          {session.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 py-4 border-y border-primary/5 text-sm text-primary/70 mb-4 bg-[#FFFBE7]/30 -mx-6 sm:-mx-8 px-6 sm:px-8 flex-1">
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
                         <span className="font-medium capitalize">{session.sessionMode || 'Video Call'}</span>
                       </div>
                       <div className="flex items-center gap-2">
                         <CreditCard className="w-4 h-4 text-primary/40" />
                         <span className={`capitalize font-medium ${session.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-[#E6A520]'}`}>
                           {session.paymentStatus || 'unpaid'}
                         </span>
                       </div>
                    </div>

                    <div className="flex justify-end items-center text-xs sm:text-sm font-medium text-primary/40 group-hover:text-[#E6A520] transition-colors">
                      View details <ChevronRight className="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform duration-300" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <SessionDetailsModal 
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        session={selectedSession}
        therapist={selectedSession ? therapists[selectedSession.therapistId] : undefined}
        onReschedule={() => {
            setIsDetailsOpen(false);
            setIsRescheduleOpen(true);
        }}
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
