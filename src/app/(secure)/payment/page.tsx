"use client";

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { toast } from "sonner";
import { ShieldCheck, ArrowRight, Loader2, CreditCard, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { bookingService } from '@/services/bookingService';
import { Booking } from '@/types';

export default function PaymentPage() {
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string>('');
  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
      setError('Invalid or missing booking link.');
      setLoading(false);
      return;
    }

    bookingService.getBookingByTokenAPIRoute(token)
      .then(data => {
        setBooking(data);
      })
      .catch((err) => {
        setError((err instanceof Error ? err.message : String(err)) || 'Failed to load booking details.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    // Dynamically load Razorpay script
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFBE7] pt-24 px-4 sm:px-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#E6A520] animate-spin" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-[#FFFBE7] pt-24 px-4 sm:px-6 flex items-center justify-center">
         <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center text-center">
             <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-6">
                 <AlertCircle className="w-8 h-8" />
             </div>
             <h2 className="text-2xl font-serif text-[#C48B1A] mb-4">Unavailable</h2>
             <p className="text-gray-600 mb-6">{error || 'Booking not found.'}</p>
             <Link href="/" className="inline-flex items-center gap-2 text-[#E6A520] font-medium hover:text-[#C48B1A] transition-colors">
                 Return Home <ChevronRight className="w-4 h-4" />
             </Link>
         </div>
      </div>
    );
  }

  if (success || (booking.status === 'confirmed' && booking.paymentStatus === 'paid')) {
    return (
      <div className="min-h-screen bg-[#FFFBE7] pt-24 px-4 sm:px-6 flex items-center justify-center">
         <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center text-center">
             <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center text-green-500 mb-6">
                 <CheckCircle2 className="w-8 h-8" />
             </div>
             <h2 className="text-2xl font-serif text-[#2F855A] mb-4">Payment Successful!</h2>
             <p className="text-gray-600 mb-6">Your session with {booking.therapistId} is now confirmed. We&apos;ve sent a confirmation email to {booking.email}.</p>
             <a href={`/manage-booking?token=${booking.bookingToken}`} className="inline-flex items-center gap-2 text-[#E6A520] font-medium hover:text-[#C48B1A] transition-colors">
                 Manage Booking <ArrowRight className="w-4 h-4" />
             </a>
         </div>
      </div>
    );
  }

  if (booking.status !== 'awaiting_payment') {
      return (
          <div className="min-h-screen bg-[#FFFBE7] pt-24 px-4 sm:px-6 flex items-center justify-center">
            <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-[#FFFBE7] rounded-full flex items-center justify-center text-[#E6A520] mb-6">
                    <ShieldCheck className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-serif text-[#C48B1A] mb-4">Status Update</h2>
                <p className="text-gray-600 mb-6 font-sans">This booking is currently {booking.status.replace("_", " ")}. Payment is not available at this moment.</p>
                <a href={`/manage-booking?token=${booking.bookingToken}`} className="inline-flex items-center gap-2 text-[#E6A520] font-medium hover:text-[#C48B1A] transition-colors">
                    Manage Booking <ChevronRight className="w-4 h-4" />
                </a>
            </div>
         </div>
      );
  }

  const handlePayment = async () => {
    if (typeof window === 'undefined' || !(window as unknown as { Razorpay: new (opts: Record<string, unknown>) => { on: (evt: string, cb: (...args: unknown[]) => void) => void, open: () => void } }).Razorpay) {
      toast.error('Razorpay SDK failed to load. Are you online?');
      return;
    }

    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_placeholder',
      amount: (booking.paymentAmount || 1500) * 100,
      currency: booking.paymentCurrency || 'INR',
      name: 'Saarthi',
      description: `Session with Therapist ${booking.therapistId}`,
      image: '/favicon.ico',
      order_id: booking.razorpayOrderId, 
      handler: async function (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string; }) {
         setVerifying(true);
         try {
           const verifyRes = await fetch('/api/payment/verify', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
               bookingId: booking.id,
               razorpay_payment_id: response.razorpay_payment_id,
               razorpay_order_id: response.razorpay_order_id,
               razorpay_signature: response.razorpay_signature
             })
           });

           const data = await verifyRes.json();
           if (!verifyRes.ok) throw new Error(data.error || 'Payment verification failed');
           
           setSuccess(true);
         } catch (err) {
           setError((err instanceof Error ? err.message : String(err)) || 'Payment verification failed. Please contact support if amount was deducted.');
         } finally {
           setVerifying(false);
         }
      },
      prefill: {
          name: booking.name,
          email: booking.email,
          contact: booking.phone || '',
      },
      theme: {
          color: '#E6A520'
      }
    };

    interface RazorpayFailResponse {
      error: {
        description: string;
      };
    }

    const rzp = new (window as unknown as { Razorpay: new (opts: Record<string, unknown>) => { on: (evt: string, cb: (response: RazorpayFailResponse) => void) => void, open: () => void } }).Razorpay(options);
    rzp.on('payment.failed', function (response: RazorpayFailResponse) {
        setError(`Payment Failed: ${response.error.description}`);
    });
    rzp.open();
  };

  return (
    <div className="min-h-screen bg-[#FFFBE7] pt-24 pb-12 px-4 sm:px-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl mx-auto"
      >
        <div className="text-center mb-8">
            <h1 className="text-3xl font-serif text-[#C48B1A] mb-2">Secure Checkout</h1>
            <p className="text-gray-600">Complete your payment to confirm the session</p>
        </div>

        <div className="bg-white rounded-[2rem] p-6 sm:p-10 shadow-xl border border-[#E6A520]/20">
          
          <div className="flex items-center gap-4 mb-8 pb-8 border-b border-gray-100">
             <div className="w-16 h-16 bg-[#FFFBE7] rounded-full flex items-center justify-center text-[#E6A520] shrink-0">
                <CreditCard className="w-8 h-8" />
             </div>
             <div>
                <div className="text-sm text-gray-500 uppercase tracking-widest font-medium mb-1">Total Amount</div>
                <div className="text-3xl font-serif text-gray-900 font-sans">₹{booking.paymentAmount || 1500}</div>
             </div>
          </div>

          <div className="space-y-6 mb-10">
             <div className="flex justify-between items-center text-sm">
                 <span className="text-gray-500">Service</span>
                 <span className="font-medium text-gray-900 capitalize">{booking.sessionMode} Session</span>
             </div>
             <div className="flex justify-between items-center text-sm">
                 <span className="text-gray-500">Therapist</span>
                 <span className="font-medium text-gray-900">{booking.therapistId}</span>
             </div>
             <div className="flex justify-between items-center text-sm">
                 <span className="text-gray-500">Date</span>
                 <span className="font-medium text-gray-900">{booking.date}</span>
             </div>
             <div className="flex justify-between items-center text-sm">
                 <span className="text-gray-500">Time</span>
                 <span className="font-medium text-gray-900">{booking.time}</span>
             </div>
          </div>

          <button
            onClick={handlePayment}
            disabled={verifying}
            className="w-full h-14 bg-[#E6A520] hover:bg-[#C48B1A] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium tracking-wide transition-all shadow-lg shadow-[#E6A520]/20 flex items-center justify-center gap-2 cursor-pointer font-sans"
          >
            {verifying ? (
               <>Verifying Payment <Loader2 className="w-5 h-5 animate-spin" /></>
            ) : (
               <>Pay ₹{booking.paymentAmount || 1500} <ArrowRight className="w-5 h-5" /></>
            )}
          </button>
          
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
            <ShieldCheck className="w-4 h-4" /> Secured by Razorpay
          </div>
        </div>
      </motion.div>
    </div>
  );
}
