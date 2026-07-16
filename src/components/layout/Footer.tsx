import Link from "next/link"
import { Mail, MapPin, Phone, Instagram } from "lucide-react"

export function Footer() {
  return (
    <footer className="bg-white border-t border-muted pt-16 pb-8">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-3 text-primary mb-4">
              <img src="/saarthi-logo-Photoroom.png" alt="Saarthi Logo" className="h-10 w-auto object-contain" referrerPolicy="no-referrer" />
              <span className="font-heading text-2xl font-bold tracking-tight text-text">Saarthi</span>
            </Link>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              A mental wellness platform helping you find clarity, balance, and emotional well-being with the right support.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://instagram.com/saarthi.safespace" 
                target="_blank" 
                rel="noopener noreferrer"
                className="p-2 rounded-full bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>
          
          <div className="md:flex md:justify-center">
            <div>
              <h4 className="font-heading font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link href="/therapists" className="hover:text-primary transition-colors">Therapists</Link></li>
                <li><Link href="/about" className="hover:text-primary transition-colors">About</Link></li>
                <li><Link href="/vision" className="hover:text-primary transition-colors">Our Vision</Link></li>
                <li><Link href="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
                <li>
                  <Link href="/admin"
                    className="hover:text-primary transition-colors block"
                  >
                    Admin Dashboard
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="md:flex md:justify-end">
            <div>
              <h4 className="font-heading font-semibold mb-4">Contact</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Mail className="h-5 w-5 text-primary shrink-0" />
                  <a href="mailto:contact@saarthilife.com" className="hover:text-primary transition-colors">
                    contact@saarthilife.com
                  </a>
                </li>
                <li className="flex items-start gap-2">
                  <Phone className="h-5 w-5 text-primary shrink-0" />
                  <span>+91 98765 43210</span>
                </li>
                <li className="flex items-start gap-2">
                  <MapPin className="h-5 w-5 text-primary shrink-0" />
                  <span>New Delhi, India</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="border-t border-muted pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Saarthi Mental Wellness. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

