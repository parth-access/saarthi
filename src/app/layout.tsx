import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import Providers from './providers';
import { Toaster } from "@/components/ui/Toaster";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  metadataBase: new URL("https://saarthilife.com"),
  title: {
    template: "%s | Saarthi",
    default: "Saarthi — Online Therapy & Mental Wellness Support",
  },
  description: "Book certified therapists for online sessions in India. Find professional counselling, therapy for anxiety, student support, and guide to emotional wellness with Saarthi.",
  keywords: [
    "online therapy India",
    "mental health support",
    "student counselling",
    "therapy for anxiety",
    "emotional wellness",
    "therapist booking platform",
    "online psychologist",
    "depression counselling",
    "CBT online"
  ],
  authors: [{ name: "Saarthi Team", url: "https://saarthilife.com" }],
  creator: "Saarthi",
  publisher: "Saarthi",
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://saarthilife.com",
    title: "Saarthi — Online Therapy & Mental Wellness Support",
    description: "Book certified therapists for online sessions in India. Professional counselling and emotional wellness guidance.",
    siteName: "Saarthi",
    images: [
      {
        url: "/api/og?title=Saarthi — Your Safe Space&description=Book verified, empathetic therapists for online counselling sessions in India.",
        width: 1200,
        height: 630,
        alt: "Saarthi — Online Therapy & Mental Wellness Support",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Saarthi — Online Therapy & Mental Wellness Support",
    description: "Book certified therapists for online sessions in India. Professional counselling and emotional wellness guidance.",
    images: ["/api/og?title=Saarthi — Your Safe Space&description=Book verified, empathetic therapists for online counselling sessions in India."],
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${playfair.variable} antialiased min-h-screen bg-background selection:bg-accent/30`}>
        <Providers>
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
