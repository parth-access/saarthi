"use client";

import React, { useEffect, useState, useCallback } from "react";
import { ChevronLeft, FileText, Download, Eye, AlertCircle, RefreshCw, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { formatSessionDate } from "@/lib/sessionDisplay";

/**
 * Payment receipts.
 *
 * Reads `/api/receipts`, which derives each receipt from the signed-in client's
 * own bookings server-side. The previous version queried Firestore from the
 * browser for `payments where userId == <uid>` — a field no payment document has
 * ever carried (see `CreatePaymentOrderCommand`), so the page was permanently
 * empty for every user regardless of how many sessions they had paid for.
 *
 * "Print / PDF" used to stage a hidden div and call `window.print()`. Both actions
 * here hit `/api/receipts/<bookingId>/pdf`, which returns a real PDF generated
 * from the stored payment and booking records; the browser's own viewer handles
 * printing from there.
 */

/** Mirrors the `Receipt` shape returned by `/api/receipts`. */
interface Receipt {
  receiptNumber: string;
  bookingId: string;
  paidAtIso: string | null;
  clientName: string;
  clientEmail: string;
  therapistName: string;
  sessionType: string;
  sessionMode: "online" | "in_person";
  sessionDate: string;
  sessionTime: string;
  amount: number;
  currency: string;
  status: "paid" | "refunded" | "partially_refunded";
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  refundedAmount: number | null;
  refundedAtIso: string | null;
  refundReference: string | null;
}

const money = (amount: number, currency?: string) =>
  `${currency === "INR" || !currency ? "₹" : `${currency} `}${Number(amount || 0).toLocaleString("en-IN")}`;

const paidOn = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
      })
    : "—";

const STATUS_STYLES: Record<Receipt["status"], string> = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-100",
  refunded: "bg-amber-50 text-amber-700 border-amber-100",
  partially_refunded: "bg-amber-50 text-amber-700 border-amber-100",
};

const STATUS_LABELS: Record<Receipt["status"], string> = {
  paid: "Paid",
  refunded: "Refunded",
  partially_refunded: "Part refunded",
};

function DashboardReceipts() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Same-origin: the httpOnly `__session` cookie authenticates the request,
      // and the endpoint takes no parameters, so there is nothing to tamper with.
      const res = await fetch("/api/receipts", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setReceipts(Array.isArray(data.receipts) ? data.receipts : []);
      } else {
        setError(data.error || "We could not load your receipts right now. Please try again.");
      }
    } catch {
      setError("We could not load your receipts right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

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
      <div className="container mx-auto max-w-4xl">
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
          {receipts.length === 0 && !error ? (
            <div className="text-center py-14">
              <div className="w-16 h-16 bg-[#FFFBE7] rounded-full flex items-center justify-center mx-auto mb-6 border border-primary/5">
                <FileText className="w-8 h-8 text-[#E6A520]" />
              </div>
              <h2 className="text-xl font-serif text-primary mb-2">No receipts yet</h2>
              <p className="text-primary/60 text-sm max-w-sm mx-auto mb-7 leading-relaxed">
                Once you pay for a session, its receipt appears here with the receipt number and
                payment reference — ready to view or download as a PDF.
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
                    <th scope="col" className="pb-4 font-medium">Paid on</th>
                    <th scope="col" className="pb-4 font-medium">Receipt</th>
                    <th scope="col" className="pb-4 font-medium">Session</th>
                    <th scope="col" className="pb-4 font-medium">Amount</th>
                    <th scope="col" className="pb-4 font-medium">Status</th>
                    <th scope="col" className="pb-4 font-medium text-right">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((receipt) => (
                    <tr key={receipt.bookingId} className="border-b border-primary/5 hover:bg-black/[0.02] align-top">
                      <td className="py-4 text-primary whitespace-nowrap">{paidOn(receipt.paidAtIso)}</td>
                      <td className="py-4 text-primary font-mono text-xs">{receipt.receiptNumber}</td>
                      <td className="py-4 text-primary">
                        <span className="block">{receipt.therapistName}</span>
                        <span className="block text-primary/50 text-xs mt-0.5">
                          {receipt.sessionType} · {formatSessionDate(receipt.sessionDate)}
                        </span>
                      </td>
                      <td className="py-4 text-primary font-medium whitespace-nowrap">
                        {money(receipt.amount, receipt.currency)}
                        {receipt.refundedAmount !== null && (
                          <span className="block text-amber-700 text-xs font-normal mt-0.5">
                            {money(receipt.refundedAmount, receipt.currency)} refunded
                          </span>
                        )}
                      </td>
                      <td className="py-4">
                        <span className={`px-2 py-1 text-[10px] rounded border uppercase tracking-wider font-medium whitespace-nowrap ${STATUS_STYLES[receipt.status]}`}>
                          {STATUS_LABELS[receipt.status]}
                        </span>
                      </td>
                      <td className="py-4 text-right whitespace-nowrap">
                        <a
                          href={`/api/receipts/${receipt.bookingId}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[#E6A520] hover:text-primary transition-colors text-xs font-semibold uppercase"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </a>
                        <a
                          href={`/api/receipts/${receipt.bookingId}/pdf?download=1`}
                          className="ml-4 inline-flex items-center gap-1.5 text-primary/60 hover:text-primary transition-colors text-xs font-semibold uppercase"
                        >
                          <Download className="w-3.5 h-3.5" /> Save
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-6 text-xs text-primary/50 leading-relaxed">
                Each receipt is a PDF generated from your payment record. Open it to print, or use
                Save to keep a copy. Need a correction? Contact us from your dashboard.
              </p>
            </div>
          )}
        </div>
      </div>
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
