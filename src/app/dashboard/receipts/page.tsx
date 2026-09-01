"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronLeft, FileText, Printer, AlertCircle, RefreshCw, ChevronRight } from "lucide-react";
import Link from "next/link";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Therapist } from "@/types";
import { toDateSafe } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
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

const money = (amount: number, currency?: string) =>
  `${currency === "INR" || !currency ? "₹" : `${currency} `}${Number(amount || 0).toLocaleString("en-IN")}`;

const receiptDate = (value: unknown) => toDateSafe(value)?.toLocaleDateString("en-GB", {
  day: "numeric", month: "short", year: "numeric",
}) || "—";

function DashboardReceipts() {
  const { currentUser } = useAuth();
  const [payments, setPayments] = useState<PaymentReceipt[]>([]);
  const [therapists, setTherapists] = useState<Record<string, Therapist>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Receipt currently staged for the browser's print / save-as-PDF dialog. */
  const [printing, setPrinting] = useState<PaymentReceipt | null>(null);

  const fetchReceipts = useCallback(async () => {
    if (!currentUser?.uid) return;
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(query(collection(db, "payments"), where("userId", "==", currentUser.uid)));
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentReceipt));
      all.sort((a, b) => (toDateSafe(b.createdAt)?.getTime() || 0) - (toDateSafe(a.createdAt)?.getTime() || 0));
      setPayments(all);

      const ids = Array.from(new Set(all.map((p) => p.therapistId).filter(Boolean)));
      const docs = await Promise.all(ids.map((id) => getDoc(doc(db, "therapists", id))));
      const tMap: Record<string, Therapist> = {};
      docs.forEach((d) => { if (d.exists()) tMap[d.id] = { id: d.id, ...d.data() } as Therapist; });
      setTherapists(tMap);
    } catch (err) {
      console.error("Failed to load receipts:", err);
      setError("We could not load your receipts right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [currentUser?.uid]);

  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

  // Stage the receipt, let React paint it, then open the print dialog.
  useEffect(() => {
    if (!printing) return;
    const id = window.setTimeout(() => {
      window.print();
      setPrinting(null);
    }, 60);
    return () => window.clearTimeout(id);
  }, [printing]);

  if (loading) {
    return (
      <div className="pt-28 pb-24 px-4 sm:px-6">
        <div className="container mx-auto max-w-4xl space-y-6">
          <Skeleton className="h-10 w-56 rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-[2rem]" />
        </div>
      </div>
    );
  }

  return (
    <div className="pt-28 pb-24 px-4 sm:px-6">
      <div className="container mx-auto max-w-4xl print:hidden">
        <div className="mb-8 font-sans">
          <Link href="/dashboard" className="inline-flex items-center text-sm text-primary/60 hover:text-primary mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to dashboard
          </Link>
          <h1 className="text-3xl font-serif text-primary">Payment receipts</h1>
          <p className="text-sm text-primary/60 mt-1">Every payment you&apos;ve made to Saarthi.</p>
        </div>

        {error && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 font-sans">
            <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</span>
            <button onClick={() => fetchReceipts()} className="inline-flex items-center gap-1.5 font-medium hover:underline cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        )}

        <div className="bg-white border border-primary/10 rounded-[2rem] p-4 md:p-8 shadow-sm font-sans">
          {payments.length === 0 ? (
            <div className="text-center py-14">
              <div className="w-16 h-16 bg-[#FFFBE7] rounded-full flex items-center justify-center mx-auto mb-6 border border-primary/5">
                <FileText className="w-8 h-8 text-[#E6A520]" />
              </div>
              <h2 className="text-xl font-serif text-primary mb-2">No receipts yet</h2>
              <p className="text-primary/60 text-sm max-w-sm mx-auto mb-7 leading-relaxed">
                Once you pay for a session, its receipt appears here with the invoice number and
                payment reference — ready to print or save as a PDF.
              </p>
              <Link
                href="/book"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-full hover:bg-primary/90 transition-colors"
              >
                Book a session <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Your Saarthi payment receipts</caption>
                <thead>
                  <tr className="border-b border-primary/10 text-primary/60 uppercase tracking-widest text-[10px]">
                    <th scope="col" className="pb-4 font-medium">Date</th>
                    <th scope="col" className="pb-4 font-medium">Invoice</th>
                    <th scope="col" className="pb-4 font-medium">Therapist</th>
                    <th scope="col" className="pb-4 font-medium">Amount</th>
                    <th scope="col" className="pb-4 font-medium">Status</th>
                    <th scope="col" className="pb-4 font-medium text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-primary/5 hover:bg-black/[0.02]">
                      <td className="py-4 text-primary whitespace-nowrap">{receiptDate(payment.createdAt)}</td>
                      <td className="py-4 text-primary font-mono text-xs">{payment.invoiceNumber || payment.id}</td>
                      <td className="py-4 text-primary">{therapists[payment.therapistId]?.name || "Your therapist"}</td>
                      <td className="py-4 text-primary font-medium whitespace-nowrap">{money(payment.amount, payment.currency)}</td>
                      <td className="py-4">
                        <span className={`px-2 py-1 text-[10px] rounded border uppercase tracking-wider font-medium capitalize ${
                          payment.paymentStatus === "refunded"
                            ? "bg-amber-50 text-amber-700 border-amber-100"
                            : "bg-emerald-50 text-emerald-700 border-emerald-100"
                        }`}>
                          {payment.paymentStatus || "paid"}
                        </span>
                      </td>
                      <td className="py-4 text-right">
                        <button
                          onClick={() => setPrinting(payment)}
                          className="inline-flex items-center gap-1.5 text-[#E6A520] hover:text-primary transition-colors text-xs font-semibold uppercase cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" /> Print / PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-6 text-xs text-primary/50 leading-relaxed">
                Choose &ldquo;Save as PDF&rdquo; in your browser&apos;s print dialog to keep a copy. Need a
                GST invoice or a correction? Contact us from your dashboard and we&apos;ll sort it out.
              </p>
            </div>
          )}
        </div>
      </div>
      {/* Printable receipt — hidden on screen, the only thing that prints. */}
      {printing && (
        <div className="hidden print:block text-black p-8 font-sans">
          <div className="flex items-start justify-between border-b border-black/10 pb-6 mb-6">
            <div>
              <h1 className="text-2xl font-serif">Saarthi</h1>
              <p className="text-xs text-black/60 mt-1">saarthilife.com · support@saarthilife.com</p>
            </div>
            <div className="text-right">
              <h2 className="text-lg font-semibold">Payment receipt</h2>
              <p className="text-xs text-black/60 mt-1">{receiptDate(printing.createdAt)}</p>
            </div>
          </div>

          <table className="w-full text-sm mb-8">
            <tbody>
              <tr><td className="py-1.5 text-black/50 w-56">Invoice number</td><td className="py-1.5 font-mono">{printing.invoiceNumber || printing.id}</td></tr>
              <tr><td className="py-1.5 text-black/50">Billed to</td><td className="py-1.5">{currentUser?.email}</td></tr>
              <tr><td className="py-1.5 text-black/50">Therapist</td><td className="py-1.5">{therapists[printing.therapistId]?.name || "Your therapist"}</td></tr>
              <tr><td className="py-1.5 text-black/50">Booking reference</td><td className="py-1.5 font-mono text-xs">{printing.bookingId}</td></tr>
              <tr><td className="py-1.5 text-black/50">Payment reference</td><td className="py-1.5 font-mono text-xs">{printing.razorpayPaymentId || "—"}</td></tr>
              <tr><td className="py-1.5 text-black/50">Status</td><td className="py-1.5 capitalize">{printing.paymentStatus || "paid"}</td></tr>
            </tbody>
          </table>

          <div className="flex items-center justify-between border-t border-black/10 pt-4">
            <span className="text-sm font-medium">Therapy session (50 minutes)</span>
            <span className="text-lg font-semibold">{money(printing.amount, printing.currency)}</span>
          </div>

          <p className="mt-10 text-[11px] text-black/50 leading-relaxed">
            This receipt is generated from Saarthi&apos;s payment records. Amounts are inclusive of applicable
            taxes unless stated otherwise. Refunds, where eligible, are returned to the original payment method.
          </p>
        </div>
      )}
    </div>
  );
}

export default function DashboardReceiptsRoute() {
  return (
    <ProtectedRoute allowedRoles={["client", "admin"]}>
      <DashboardReceipts />
    </ProtectedRoute>
  );
}
