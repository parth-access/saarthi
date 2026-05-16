import * as React from "react"
import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import Navbar from "./components/layout/Navbar"
import { Footer } from "./components/layout/Footer"
import ScrollToTop from "./components/layout/ScrollToTop"
import { Modal } from "./components/ui/Modal"
import { Loader2 } from "lucide-react"
import { AuthProvider } from "./contexts/AuthContext"
import { ProtectedRoute } from "./components/auth/ProtectedRoute"

// Lazy load pages for better bundle size
const Home = React.lazy(() => import("./screens/Home"))
const Therapists = React.lazy(() => import("./screens/Therapists"))
const Vision = React.lazy(() => import("./screens/Vision"))
const About = React.lazy(() => import("./screens/About"))
const Contact = React.lazy(() => import("./screens/Contact"))
const Admin = React.lazy(() => import("./screens/Admin"))
const DravinaProfile = React.lazy(() => import("./screens/DravinaProfile"))
const NotFound = React.lazy(() => import("./screens/NotFound"))
const BookingSystem = React.lazy(() => import("./components/booking/BookingSystem"))
const Login = React.lazy(() => import("./screens/Login"))
const ManageBooking = React.lazy(() => import("./screens/ManageBooking"))
const Payment = React.lazy(() => import("./screens/Payment").then(m => ({ default: m.Payment })))

const PageLoader = () => (
  <div className="flex h-screen w-screen items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
)

function App() {
  const [isBookingOpen, setIsBookingOpen] = React.useState(false)

  return (
    <HelmetProvider>
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
                <Route path="/login" element={<Login />} />
                <Route 
                  path="/admin" 
                  element={
                    <ProtectedRoute>
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
                <Route path="/manage-booking" element={<ManageBooking />} />
                <Route path="/payment" element={<Payment />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </React.Suspense>
            <Footer />

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
          </div>
        </Router>
      </AuthProvider>
    </HelmetProvider>
  )
}

export default App
