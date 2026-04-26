import * as React from "react"
import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import { SWRConfig } from "swr"
import { AuthProvider } from "./contexts/AuthContext"
import { ProtectedRoute } from "./components/auth/ProtectedRoute"
import Navbar from "./components/layout/Navbar"
import { Footer } from "./components/layout/Footer"
import ScrollToTop from "./components/layout/ScrollToTop"
import { Modal } from "./components/ui/Modal"
import { AdminAuthModal } from "./components/auth/AdminAuthModal"
import { Loader2 } from "lucide-react"

// Lazy load pages for better bundle size
const Home = React.lazy(() => import("./pages/Home"))
const Therapists = React.lazy(() => import("./pages/Therapists"))
const Vision = React.lazy(() => import("./pages/Vision"))
const About = React.lazy(() => import("./pages/About"))
const Contact = React.lazy(() => import("./pages/Contact"))
const Admin = React.lazy(() => import("./pages/Admin"))
const DravinaProfile = React.lazy(() => import("./pages/DravinaProfile"))
const NotFound = React.lazy(() => import("./pages/NotFound"))
const BookingSystem = React.lazy(() => import("./components/booking/BookingSystem"))

const PageLoader = () => (
  <div className="flex h-screen w-screen items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
)

function App() {
  const [isBookingOpen, setIsBookingOpen] = React.useState(false)
  const [isAdminLoginOpen, setIsAdminLoginOpen] = React.useState(false)

  return (
    <HelmetProvider>
      <SWRConfig 
        value={{
          revalidateOnFocus: false,
          shouldRetryOnError: false,
          dedupingInterval: 5000,
          fetcher: (url: string) => fetch(url).then(res => res.json()).then(res => {
            if (!res.success) throw new Error(res.error || 'Failed to fetch');
            return res.data;
          })
        }}
      >
        <AuthProvider>
          <Router>
            <ScrollToTop />
            <div className="min-h-screen bg-background selection:bg-accent/30">
              <Navbar onBookClick={() => setIsBookingOpen(true)} />
              <React.Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Home onBookClick={() => setIsBookingOpen(true)} />} />
                  <Route path="/therapists" element={<Therapists />} />
                  <Route path="/vision" element={<Vision />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact onBookClick={() => setIsBookingOpen(true)} />} />
                  <Route 
                    path="/admin" 
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'therapist']}>
                        <Admin />
                      </ProtectedRoute>
                    } 
                  />
                  <Route path="/therapists/dravina" element={<DravinaProfile onBookClick={() => setIsBookingOpen(true)} />} />
                  <Route path="/book" element={
                    <div className="pt-24 min-h-screen bg-[#FFFBE7]">
                      <BookingSystem />
                    </div>
                  } />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </React.Suspense>
              <Footer onAdminLogin={() => setIsAdminLoginOpen(true)} />

              <Modal 
                isOpen={isBookingOpen} 
                onClose={() => setIsBookingOpen(false)} 
                title="Book a Session"
                className="sm:max-w-3xl"
              >
                <React.Suspense fallback={<div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div>}>
                  <BookingSystem />
                </React.Suspense>
              </Modal>

              <AdminAuthModal 
                isOpen={isAdminLoginOpen} 
                onClose={() => setIsAdminLoginOpen(false)} 
              />
            </div>
          </Router>
        </AuthProvider>
      </SWRConfig>
    </HelmetProvider>
  )
}

export default App
