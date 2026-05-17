"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Calendar, ChevronLeft, Filter } from "lucide-react";
import Link from "next/link";
import { collection, query, where, getDocs, orderBy, getDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase/client";
import { Booking, Therapist } from "../types";

export default function DashboardBookings() {
  const { currentUser } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [therapists, setTherapists] = useState<Record<string, Therapist>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('all');

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

  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  const handleReschedule = async (session: Booking) => {
    const reason = window.prompt("Please provide a reason for rescheduling:");
    if (!reason) return;

    setReschedulingId(session.id);
    try {
      const res = await fetch('/api/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser?.uid,
          userEmail: currentUser?.email,
          userName: currentUser?.email?.split('@')[0], // or userProfile?.name
          therapistId: session.therapistId,
          bookingId: session.id,
          reason
        })
      });
      if (!res.ok) throw new Error("Failed to send request");
      alert("Reschedule request sent to admin. We will contact you soon.");
    } catch (err) {
      alert("Failed to send reschedule request. Please try again.");
    } finally {
      setReschedulingId(null);
    }
  };

  const nowStr = new Date().toISOString().split('T')[0];
  
  const filteredBookings = bookings.filter(b => {
    if (filter === 'upcoming') return b.date >= nowStr && b.status !== 'cancelled' && b.status !== 'rejected';
    if (filter === 'past') return b.date < nowStr || b.status === 'cancelled' || b.status === 'rejected' || b.status === 'completed';
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen pt-32 pb-24 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 pb-24 bg-[#FFFBE7]">
      <div className="container mx-auto px-6 max-w-4xl">
        <div className="mb-8">
          <Link href="/dashboard" className="inline-flex items-center text-sm text-primary/60 hover:text-primary mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Dashboard
          </Link>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-3xl font-serif text-primary">All Sessions</h1>
            
            <div className="flex bg-white rounded-full p-1 border border-primary/10 shadow-sm w-fit">
              {(['all', 'upcoming', 'past'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                    filter === f ? 'bg-primary text-white' : 'text-primary/60 hover:text-primary'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white border border-primary/10 rounded-[2rem] p-4 md:p-8 shadow-sm">
          {filteredBookings.length === 0 ? (
            <div className="text-center py-12 text-primary/60">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No {filter !== 'all' ? filter : ''} sessions found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBookings.map(session => (
                <div key={session.id} className="border border-primary/10 rounded-2xl p-6 hover:shadow-md transition-shadow">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-[#E6A520] font-bold mb-1">
                        {session.sessionType} Session
                      </p>
                      <h3 className="font-medium text-lg text-primary">{therapists[session.therapistId]?.name || "Your Therapist"}</h3>
                      <p className="text-sm text-primary/60 mt-1">Booking ID: {session.id}</p>
                    </div>
                    <div className="flex flex-col items-start md:items-end gap-2">
                       <span className="px-3 py-1 bg-primary/5 text-primary text-xs rounded-full uppercase tracking-wider font-medium">
                        {session.status.replace('_', ' ')}
                      </span>
                      <span className="px-3 py-1 bg-[#E6A520]/10 text-[#E6A520] text-xs rounded-full uppercase tracking-wider font-medium">
                        Payment: {session.paymentStatus || 'unpaid'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-primary/5 text-sm">
                     <div>
                       <p className="text-primary/40 text-xs uppercase tracking-wider mb-1">Date</p>
                       <p className="font-medium text-primary">{session.date}</p>
                     </div>
                     <div>
                       <p className="text-primary/40 text-xs uppercase tracking-wider mb-1">Time</p>
                       <p className="font-medium text-primary">{session.time}</p>
                     </div>
                     <div>
                       <p className="text-primary/40 text-xs uppercase tracking-wider mb-1">Mode</p>
                       <p className="font-medium text-primary capitalize">{session.sessionMode || 'Video Call'}</p>
                     </div>
                     <div>
                       <p className="text-primary/40 text-xs uppercase tracking-wider mb-1">Actions</p>
                       {/* Reschedule request if upcoming */}
                       {session.date >= nowStr && (session.status === 'confirmed' || session.status === 'pending') ? (
                         <button 
                           onClick={() => handleReschedule(session)} 
                           disabled={reschedulingId === session.id}
                           className="text-[#E6A520] hover:underline text-xs font-medium"
                          >
                           {reschedulingId === session.id ? 'Sending...' : 'Request Reschedule'}
                         </button>
                       ) : (
                         <span className="text-primary/40 text-xs">-</span>
                       )}
                     </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}