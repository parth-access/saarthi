"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { ChevronLeft, FileText, Download } from "lucide-react";
import Link from "next/link";
import { collection, query, where, getDocs, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase/client";
import { Therapist } from "../types";

interface PaymentReceipt {
  id: string;
  bookingId: string;
  userId: string;
  therapistId: string;
  amount: number;
  currency: string;
  paymentStatus: string;
  razorpayPaymentId: string;
  createdAt: any;
  invoiceNumber: string;
}

export default function DashboardReceipts() {
  const { currentUser } = useAuth();
  const [payments, setPayments] = useState<PaymentReceipt[]>([]);
  const [therapists, setTherapists] = useState<Record<string, Therapist>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    
    // In a real app we'd query 'payments' collection by userId:
    // const q = query(collection(db, 'payments'), where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'));
    // Since we don't have the payments collection populated realistically from previous steps,
    // we'll fetch completed/paid bookings and map them as a fallback for this demo, Or just query payments.
    const fetchReceipts = async () => {
      try {
        const paymentsRef = collection(db, 'payments');
        const q = query(
          paymentsRef, 
          where('userId', '==', currentUser.uid),
        );
        
        const snap = await getDocs(q);
        const allPayments = snap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentReceipt));
        
        // Sorting manually if we didn't index createdAt
        allPayments.sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        
        setPayments(allPayments);
        
        const tIds = new Set<string>();
        allPayments.forEach(p => tIds.add(p.therapistId));
        
        const tMap: Record<string, Therapist> = {};
        for (const tId of Array.from(tIds)) {
            const tDoc = await getDoc(doc(db, 'therapists', tId));
            if (tDoc.exists()) {
                tMap[tId] = { id: tDoc.id, ...tDoc.data() } as Therapist;
            }
        }
        setTherapists(tMap);

      } catch (err) {
        console.error("Failed to load receipts:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchReceipts();
  }, [currentUser]);

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
          <h1 className="text-3xl font-serif text-primary">Payment Receipts</h1>
        </div>

        <div className="bg-white border border-primary/10 rounded-[2rem] p-4 md:p-8 shadow-sm">
          {payments.length === 0 ? (
            <div className="text-center py-12 text-primary/60">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>You have no payment receipts.</p>
            </div>
          ) : (
             <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-primary/10 text-primary/60 uppercase tracking-widest text-[10px]">
                      <th className="pb-4 font-medium">Date</th>
                      <th className="pb-4 font-medium">Invoice #</th>
                      <th className="pb-4 font-medium">Therapist</th>
                      <th className="pb-4 font-medium">Amount</th>
                      <th className="pb-4 font-medium">Status</th>
                      <th className="pb-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(payment => (
                      <tr key={payment.id} className="border-b border-primary/5 hover:bg-black/[0.02]">
                        <td className="py-4 text-primary whitespace-nowrap">
                          {payment.createdAt?.toDate ? payment.createdAt.toDate().toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="py-4 text-primary font-mono text-xs">{payment.invoiceNumber || '-'}</td>
                        <td className="py-4 text-primary">{therapists[payment.therapistId]?.name || 'Unknown'}</td>
                        <td className="py-4 text-primary font-medium">
                           {payment.currency === 'INR' ? '₹' : payment.currency}{payment.amount}
                        </td>
                        <td className="py-4">
                          <span className="px-2 py-1 bg-green-50 text-green-700 text-[10px] rounded border border-green-100 uppercase tracking-wider font-medium">
                            {payment.paymentStatus}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <button 
                            className="inline-flex items-center text-[#E6A520] hover:text-primary transition-colors text-xs font-medium uppercase"
                            onClick={() => toast.info("Invoice PDF download is not implemented yet.")}
                          >
                            <Download className="w-3 h-3 mr-1" /> PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
