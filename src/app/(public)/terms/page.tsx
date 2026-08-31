import React from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { FileText, AlertTriangle, ShieldCheck, Mail, MapPin } from 'lucide-react';
import { ogImage } from '@/lib/og';

const termsOgImageUrl = ogImage(
  'Terms of Service — Saarthi',
  'Terms governing session bookings, cancellations, payments, and platform usage.'
);

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: "Saarthi's Terms of Service govern your use of our online therapy platform, session bookings, rescheduling policies, payments, and counsellor consultations.",
  openGraph: {
    title: 'Terms of Service | Saarthi',
    description: "Saarthi's Terms of Service govern your use of our online therapy platform, session bookings, rescheduling policies, and counsellor consultations.",
    url: 'https://saarthilife.com/terms',
    images: [
      {
        url: termsOgImageUrl,
        width: 1200,
        height: 630,
        alt: 'Saarthi Terms of Service',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Terms of Service | Saarthi',
    description: "Saarthi's Terms of Service govern platform usage, session bookings, and rescheduling.",
    images: [termsOgImageUrl],
  },
  alternates: {
    canonical: '/terms',
  },
};

export default function TermsPage() {
  const lastUpdated = "August 31, 2026";

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': 'Saarthi Terms of Service',
    'url': 'https://saarthilife.com/terms',
    'description': 'Terms of Service for Saarthi mental health and therapy booking platform.',
    'publisher': {
      '@type': 'Organization',
      'name': 'Saarthi',
      'url': 'https://saarthilife.com'
    }
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="pt-28 pb-20 bg-background min-h-screen">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          
          {/* Page Header */}
          <div className="mb-12 border-b border-primary/10 pb-8">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/5 text-primary text-xs font-semibold uppercase tracking-wider mb-4">
              <FileText className="w-4 h-4 text-[#E6A520]" />
              <span>Platform Agreement</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-primary mb-4">
              Terms of Service
            </h1>
            <p className="text-muted-foreground text-sm font-medium">
              Last Updated: {lastUpdated}
            </p>
          </div>

          {/* Important Crisis Disclaimer Banner */}
          <div className="p-6 rounded-2xl bg-red-50/90 border border-red-200 mb-10 space-y-3">
            <div className="flex items-center gap-2 text-red-800 font-bold text-base">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <span>Emergency &amp; Mental Health Crisis Disclaimer</span>
            </div>
            <p className="text-xs sm:text-sm text-red-900/90 leading-relaxed">
              <strong>Saarthi is not designed for emergency or crisis intervention.</strong> If you are experiencing thoughts of self-harm, severe psychiatric distress, or a life-threatening emergency, please do not rely on an online appointment booking. Immediately call national emergency helpline <strong>112</strong> (India), visit the nearest emergency room, or reach out to Tele-MANAS (<strong>14416 / 1800-891-4416</strong>) or KIRAN helpline (<strong>1800-599-0019</strong>).
            </p>
          </div>

          {/* Content Sections */}
          <div className="space-y-10 text-primary/90 text-sm sm:text-base leading-relaxed">
            
            {/* 1. Acceptance */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">1. Acceptance of Terms</h2>
              <p>
                Welcome to Saarthi. By visiting saarthilife.com or booking a therapy session through our platform, you agree to abide by these Terms of Service and our <Link href="/privacy" className="font-semibold text-primary underline hover:text-[#E6A520]">Privacy Policy</Link>. If you do not agree with any part of these terms, please discontinue use of the platform.
              </p>
            </section>

            {/* 2. Platform Description */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">2. Services Description</h2>
              <p>
                Saarthi operates an online technology platform connecting clients with independent, verified, licensed therapists and psychologists. Through Saarthi, clients can schedule individual therapy sessions, receive video consultation links, and manage appointments.
              </p>
            </section>

            {/* 3. Bookings, Scheduling & Time Slots */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">3. Booking &amp; Scheduling</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong className="text-primary">Appointment Slots:</strong> Sessions are scheduled in fixed time increments (e.g. 50 minutes). Selected time slots are held temporarily during checkout and confirmed upon payment verification.</li>
                <li><strong className="text-primary">Session Access:</strong> Confirmed sessions include a Google Meet video link provided via email confirmation and calendar invitation.</li>
                <li><strong className="text-primary">Accuracy:</strong> You are responsible for ensuring your contact details (email and phone number) are accurate so session reminders and meeting links reach you.</li>
              </ul>
            </section>

            {/* 4. Payments & Pricing */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">4. Pricing &amp; Payment Processing</h2>
              <p>
                Session pricing (e.g. ₹1,500 per 50-minute individual session) is displayed during booking. All payments are processed securely through Razorpay prior to session confirmation. Prices are subject to change, but existing confirmed bookings will not be retroactively modified.
              </p>
            </section>

            {/* 5. Rescheduling, Cancellations & Refunds */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">5. Rescheduling &amp; Cancellation Policy</h2>
              <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10 space-y-3">
                <div className="flex items-center gap-2 font-bold text-primary text-sm">
                  <ShieldCheck className="w-4 h-4 text-[#1F5E3B]" />
                  <span>Rescheduling Flexibility Included</span>
                </div>
                <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-muted-foreground">
                  <li><strong className="text-primary">Rescheduling:</strong> Clients can reschedule their session up to 24 hours prior to the scheduled start time through the booking management link or by contacting support, subject to therapist availability.</li>
                  <li><strong className="text-primary">Late Cancellations &amp; No-Shows:</strong> If a client fails to attend a session without prior notice or cancels within 24 hours of the appointment, the session fee may be forfeited to compensate the therapist for reserved time.</li>
                  <li><strong className="text-primary">Therapist Rescheduling:</strong> In rare cases where a therapist must reschedule due to emergency or illness, the client will be offered a replacement slot or a full refund.</li>
                </ul>
              </div>
            </section>

            {/* 6. Therapist & Client Relationship */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">6. Therapist &amp; Client Relationship</h2>
              <p>
                Therapists on Saarthi act as independent practitioners exercising professional clinical judgment. Saarthi provides the booking, scheduling, and payment technology infrastructure but does not dictate therapy methodologies or replace individual professional clinical care.
              </p>
            </section>

            {/* 7. Client Conduct & Responsibilities */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">7. Client Responsibilities &amp; Code of Conduct</h2>
              <p>When using Saarthi, you agree to:</p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                <li>Provide genuine contact and intake details.</li>
                <li>Join online video sessions from a safe, private, and quiet environment.</li>
                <li>Treat therapists and platform support staff with mutual respect. Harassment, abuse, or inappropriate conduct will result in immediate termination of services without refund.</li>
                <li>Refrain from audio or video recording sessions without express written consent from the therapist.</li>
              </ul>
            </section>

            {/* 8. Intellectual Property */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">8. Intellectual Property Rights</h2>
              <p>
                All website design, logos, trademarks, text, software code, and content published on saarthilife.com belong exclusively to Saarthi Mental Wellness. You may not copy, reproduce, or distribute platform materials without prior written approval.
              </p>
            </section>

            {/* 9. Limitation of Liability */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">9. Limitation of Liability</h2>
              <p>
                To the fullest extent permitted by applicable law, Saarthi, its founders, and technical partners shall not be liable for indirect, incidental, or consequential damages resulting from platform downtime, technical connectivity issues, or third-party service outages.
              </p>
            </section>

            {/* 10. Modifications & Governing Law */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">10. Modifications &amp; Governing Law</h2>
              <p>
                We reserve the right to modify these Terms of Service at any time. Continued platform usage after published updates signifies acceptance of modified terms. These terms are governed by the laws of India, with jurisdiction in New Delhi.
              </p>
            </section>

            {/* 11. Contact Support */}
            <section className="p-6 rounded-2xl bg-primary/5 border border-primary/10 space-y-3">
              <h2 className="text-lg font-serif font-bold text-primary">11. Questions &amp; Support Contact</h2>
              <p className="text-xs text-muted-foreground">
                If you need help with a booking, rescheduling request, or terms clarification, please contact our support team:
              </p>
              <div className="text-xs space-y-2 text-primary font-medium">
                <p className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#E6A520]" />
                  <span>Email: <a href="mailto:contact@saarthilife.com" className="underline hover:text-[#E6A520]">contact@saarthilife.com</a></span>
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#E6A520]" />
                  <span>Location: New Delhi, India</span>
                </p>
              </div>
            </section>

          </div>

          {/* Bottom Link to Privacy */}
          <div className="mt-12 pt-8 border-t border-primary/10 flex items-center justify-between text-xs text-muted-foreground">
            <span>Want to learn how we protect your intake data?</span>
            <Link href="/privacy" className="font-semibold text-primary underline hover:text-[#E6A520]">
              Read Privacy Policy &rarr;
            </Link>
          </div>

        </div>
      </div>
    </>
  );
}
