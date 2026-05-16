import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import Providers from './providers';

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: {
    template: "%s | Saarthi",
    default: "Saarthi - Mental Wellness & Therapy",
  },
  description: "Book certified therapists for online sessions. Find your guide to mental wellness with Saarthi.",
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "Saarthi",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable} antialiased min-h-screen bg-background selection:bg-accent/30`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
