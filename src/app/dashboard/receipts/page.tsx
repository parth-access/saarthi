"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ChevronLeft, FileText, Download } from "lucide-react";
import Link from "next/link";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Therapist } from "@/types";
import { toDateSafe } from "@/lib/utils";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

interface PaymentReceipt {
  id: string;
  bookingId: string;
  userId: string;
  therapistId: string;
  amount: number;
  currency: string;
  paymentStatus: string;
  razorpayPaymentId: string;
  createdAt: unknown;
  invoiceNumber: string;
}

function DashboardReceipts() {
  const { currentUser } = useAuth();
  const [payments, setPayments] = useState<PaymentReceipt[]>([]);
  const [therapists, setTherapists] = useState<Record<string, Therapist>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    
    const fetchReceipts = async () => {
      try {
        const paymentsRef = collection(db, 'payments');
        const q = query(
          paymentsRef, 
          where('userId', '==', currentUser.uid),
        );
        
        const snap = await getDocs(q);
        const allPayments = snap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentReceipt));
        
        allPayments.sort((a,b) => {
           const timeA = a.createdAt && typeof a.createdAt === 'object' && 'toMillis' in a.createdAt ? (a.createdAt as { toMillis: () => number }).toMillis() : 0;
           const timeB = b.createdAt && typeof b.createdAt === 'object' && 'toMillis' in b.createdAt ? (b.createdAt as { toMillis: () => number }).toMillis() : 0;
           return timeB - timeA;
        });
        
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
      <div className="min-h-screen pt-32 pb-24 flex items-center justify-center bg-[#FFFBE7]">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 pb-24 bg-[#FFFBE7]">
      <div className="container mx-auto px-6 max-w-4xl">
        <div className="mb-8 font-sans">
          <Link href="/dashboard" className="inline-flex items-center text-sm text-primary/60 hover:text-primary mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Dashboard
          </Link>
          <h1 className="text-3xl font-serif text-primary">Payment Receipts</h1>
        </div>

        <div className="bg-white border border-primary/10 rounded-[2rem] p-4 md:p-8 shadow-sm font-sans">
          {payments.length === 0 ? (
            <div className="text-center py-12 md:py-16 text-primary">
              <div className="w-16 h-16 bg-[#FFFBE7] rounded-full flex items-center justify-center mx-auto mb-6 border border-primary/5">
                <FileText className="w-8 h-8 text-[#E6A520]" />
              </div>
              <h2 className="text-xl font-serif text-primary mb-2">No invoices found yet</h2>
              <p className="text-primary/60 text-sm max-w-sm mx-auto mb-10 leading-relaxed">
                Your payment receipts will appear here after session confirmations and successful transactions.
              </p>
              
              <div className="border-t border-primary/5 pt-8">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#E6A520] mb-6 text-left">
                  Sample Receipts Preview
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { id: "INV-PRE-101", name: "Empathetic Therapy Session", amount: "₹1,500.00" },
                    { id: "INV-PRE-102", name: "Initial Clinical Assessment", amount: "₹2,000.00" }
                  ].map((mock, idx) => (
                    <div key={idx} className="bg-[#FFFBE7]/20 border border-dashed border-primary/10 rounded-2xl p-5 text-left relative overflow-hidden group">
                      <div className="absolute top-0 right-0 px-3 py-1 bg-primary/5 text-primary/40 text-[9px] uppercase tracking-wider font-semibold rounded-bl-xl border-l border-b border-primary/5">
                        Format Preview
                      </div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-full bg-[#E6A520]/5 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-[#E6A520]/50" />
                        </div>
                        <div>
                          <span className="font-mono text-[10px] text-primary/40 block leading-none mb-1">{mock.id}</span>
                          <h4 className="text-sm font-medium text-primary/70">{mock.name}</h4>
                        </div>
                      </div>
                      <div className="flex justify-between items-end border-t border-primary/5 pt-4">
                        <div>
                          <p className="text-[10px] text-primary/30 uppercase tracking-widest font-medium">Est. Amount</p>
                          <span className="text-base font-semibold text-primary/60">{mock.amount}</span>
                        </div>
                        <button
                          onClick={() => toast.success("This is an elegant preview receipt. Live PDFs will become active upon payment verification.")}
                          className="px-3 py-1.5 bg-primary/5 rounded-xl text-xs font-medium text-primary/55 hover:bg-primary/10 transition-all flex items-center gap-1.5 cursor-pointer border border-primary/5"
                        >
                          <Download className="w-3.5 h-3.5" /> Preview PDF
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
                          {payment.createdAt ? (toDateSafe(payment.createdAt)?.toLocaleDateString() || 'N/A') : 'N/A'}
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
                            className="inline-flex items-center text-[#E6A520] hover:text-primary transition-colors text-xs font-medium uppercase cursor-pointer"
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

export default function DashboardReceiptsRoute() {
  return (
    <ProtectedRoute allowedRoles={['client', 'admin']}>
      <DashboardReceipts />
    </ProtectedRoute>
  );
}
