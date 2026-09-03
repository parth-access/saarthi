import React from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { Shield, Lock, Mail, MapPin } from 'lucide-react';
import { ogImage } from '@/lib/og';

const privacyOgImageUrl = ogImage(
  'Privacy Policy — Saarthi',
  'How Saarthi protects your personal data and confidential intake information for online therapy.'
);

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: "Saarthi's Privacy Policy details how we collect, process, and safeguard your personal contact and confidential intake details for online mental health therapy.",
  openGraph: {
    title: 'Privacy Policy | Saarthi',
    description: "Saarthi's Privacy Policy details how we collect, process, and safeguard your personal contact and confidential intake details.",
    url: 'https://www.saarthilife.com/privacy',
    images: [
      {
        url: privacyOgImageUrl,
        width: 1200,
        height: 630,
        alt: 'Saarthi Privacy Policy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Privacy Policy | Saarthi',
    description: "Saarthi's Privacy Policy details how we collect, process, and safeguard your personal data.",
    images: [privacyOgImageUrl],
  },
  alternates: {
    canonical: '/privacy',
  },
};

export default function PrivacyPage() {
  const lastUpdated = "August 31, 2026";

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': 'Saarthi Privacy Policy',
    'url': 'https://www.saarthilife.com/privacy',
    'description': 'Privacy Policy for Saarthi mental health and therapy booking platform.',
    'publisher': {
      '@type': 'Organization',
      'name': 'Saarthi',
      'url': 'https://www.saarthilife.com'
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
              <Shield className="w-4 h-4 text-[#1F5E3B]" />
              <span>Legal &amp; Privacy</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-primary mb-4">
              Privacy Policy
            </h1>
            <p className="text-muted-foreground text-sm font-medium">
              Last Updated: {lastUpdated}
            </p>
          </div>

          {/* Privacy Intro Banner */}
          <div className="p-6 rounded-2xl bg-[#FFFBE7] border border-primary/10 mb-10 space-y-3">
            <div className="flex items-center gap-2 text-primary font-bold text-base">
              <Lock className="w-5 h-5 text-[#E6A520]" />
              <span>Your Privacy &amp; Emotional Safety First</span>
            </div>
            <p className="text-sm text-primary/80 leading-relaxed">
              Saarthi is committed to maintaining the confidentiality, security, and integrity of your personal information. This Privacy Policy outlines how we collect, use, and protect information when you visit saarthilife.com or book online therapy sessions with our verified professionals.
            </p>
          </div>

          {/* Content Sections */}
          <div className="space-y-10 text-primary/90 text-sm sm:text-base leading-relaxed">
            
            {/* 1. What Saarthi Is */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">1. About Saarthi</h2>
              <p>
                Saarthi (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates an online mental health and wellness platform connecting individuals in India and worldwide with qualified, verified therapists and counsellors for individual therapy, anxiety guidance, and emotional support.
              </p>
            </section>

            {/* 2. Information We Collect */}
            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">2. Information We Collect</h2>
              <p>We collect information necessary to facilitate session bookings, enable video sessions, process payments, and provide quality care. This includes:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong className="text-primary">Contact Details:</strong> Your full name, email address, phone number, age, and gender provided during session booking.</li>
                <li><strong className="text-primary">Intake &amp; Note Details:</strong> Voluntary notes or intake messages you submit for your assigned therapist regarding what brings you to therapy.</li>
                <li><strong className="text-primary">Session Details:</strong> Appointment date, time, selected therapist, and therapy type (e.g. Individual Therapy).</li>
                <li><strong className="text-primary">Payment Data:</strong> Transactions are handled by our third-party payment gateway, Razorpay. Saarthi does not store your raw credit card numbers, debit card details, CVV, or net banking passwords.</li>
                <li><strong className="text-primary">Technical Logs:</strong> Standard web analytics and server logs (such as IP address, device type, and browser operating system) to ensure security and site functionality.</li>
              </ul>
            </section>

            {/* 3. Google Workspace, Calendar & Video Sessions */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">3. Google Workspace &amp; Google Calendar/Meet Integration</h2>
              <p>
                To provide seamless online video therapy, Saarthi integrates with Google Calendar and Google Meet APIs via secure OAuth authentication.
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>We create calendar events and Google Meet links specifically for your scheduled therapy appointments.</li>
                <li>We access calendar event details exclusively to schedule, reschedule, update, or cancel your therapy sessions and issue meeting invitations to you and your assigned therapist.</li>
                <li>We do not read, store, or modify unrelated calendar events, personal emails, or files in your Google account.</li>
              </ul>
            </section>

            {/* 4. How We Use Information */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">4. How We Use Your Information</h2>
              <p>Your information is used strictly for legitimate operational and service delivery purposes:</p>
              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/5 space-y-1">
                  <span className="font-semibold text-primary block">Session Facilitation</span>
                  <p className="text-xs text-muted-foreground">To confirm bookings, assign your selected therapist, and generate secure meeting links.</p>
                </div>
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/5 space-y-1">
                  <span className="font-semibold text-primary block">Communication &amp; Reminders</span>
                  <p className="text-xs text-muted-foreground">To send email receipts, booking confirmations, and upcoming session reminders.</p>
                </div>
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/5 space-y-1">
                  <span className="font-semibold text-primary block">Customer Support</span>
                  <p className="text-xs text-muted-foreground">To assist with scheduling adjustments, technical inquiries, or payment support.</p>
                </div>
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/5 space-y-1">
                  <span className="font-semibold text-primary block">Safety &amp; Compliance</span>
                  <p className="text-xs text-muted-foreground">To maintain platform security, prevent unauthorized access, and fulfill legal requirements.</p>
                </div>
              </div>
            </section>

            {/* 5. Confidentiality & Therapist Access */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">5. Therapist Confidentiality</h2>
              <p>
                Intake notes and information shared during booking or therapy sessions are held in strict confidence. Your intake note is accessible solely to your assigned therapist for session preparation. Counselors and psychologists on Saarthi adhere to professional ethical codes and confidentiality standards.
              </p>
            </section>

            {/* 6. Data Security */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">6. Data Security</h2>
              <p>
                We employ industry-standard technical safeguards, access controls, and encrypted communication channels to protect your data. While no internet transmission is 100% immune from security breaches, we continuously monitor and improve our infrastructure to mitigate risks.
              </p>
            </section>

            {/* 7. Third-Party Service Providers */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">7. Third-Party Service Providers</h2>
              <p>
                We share data only with essential infrastructure providers required to operate our service:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong className="text-primary">Razorpay:</strong> Secure payment processing.</li>
                <li><strong className="text-primary">Google Cloud / Workspace:</strong> Google Calendar &amp; Meet integration for video consultations.</li>
                <li><strong className="text-primary">Firebase / Database Hosting:</strong> Secure cloud data storage and authentication infrastructure.</li>
              </ul>
              <p className="text-xs text-muted-foreground pt-1">
                We do not sell, rent, or trade your personal or therapy data to third-party advertisers or data brokers.
              </p>
            </section>

            {/* 8. Data Retention & Deletion */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">8. Data Retention &amp; Your Rights</h2>
              <p>
                We retain booking records and contact information for as long as necessary to maintain your account history and comply with financial accounting obligations. You have the right to:
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                <li>Request access to your stored personal contact details.</li>
                <li>Request corrections to inaccurate personal details.</li>
                <li>Request the deletion of your account and personal contact information by contacting support.</li>
              </ul>
            </section>

            {/* 9. Policy Updates */}
            <section className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">9. Changes to This Privacy Policy</h2>
              <p>
                We may update this Privacy Policy periodically to reflect technological updates, service enhancements, or legal requirements. Material changes will be noted on this page with an updated revision date.
              </p>
            </section>

            {/* 10. Contact Us */}
            <section className="p-6 rounded-2xl bg-primary/5 border border-primary/10 space-y-3">
              <h2 className="text-lg font-serif font-bold text-primary">10. Contact &amp; Privacy Inquiries</h2>
              <p className="text-xs text-muted-foreground">
                For questions, data access requests, or privacy concerns, please contact our support team:
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

          {/* Bottom Link to Terms */}
          <div className="mt-12 pt-8 border-t border-primary/10 flex items-center justify-between text-xs text-muted-foreground">
            <span>Have questions about booking terms?</span>
            <Link href="/terms" className="font-semibold text-primary underline hover:text-[#E6A520]">
              Read Terms of Service &rarr;
            </Link>
          </div>

        </div>
      </div>
    </>
  );
}
