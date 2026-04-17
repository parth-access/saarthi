import * as React from "react"
import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import Navbar from "./components/layout/Navbar"
import { Footer } from "./components/layout/Footer"
import Home from "./pages/Home"
import Therapists from "./pages/Therapists"
import Vision from "./pages/Vision"
import About from "./pages/About"
import Contact from "./pages/Contact"
import Admin from "./pages/Admin"
import DravinaProfile from "./pages/DravinaProfile"
import ScrollToTop from "./components/layout/ScrollToTop"
import { Modal } from "./components/ui/Modal"
import { BookingForm } from "./components/forms/BookingForm"

function App() {
  const [isBookingOpen, setIsBookingOpen] = React.useState(false)

  return (
    <HelmetProvider>
      <Router>
        <ScrollToTop />
        <div className="min-h-screen bg-background selection:bg-accent/30">
          <Navbar onBookClick={() => setIsBookingOpen(true)} />
          <Routes>
            <Route path="/" element={<Home onBookClick={() => setIsBookingOpen(true)} />} />
            <Route path="/therapists" element={<Therapists />} />
            <Route path="/vision" element={<Vision />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/therapists/dravina" element={<DravinaProfile />} />
          </Routes>
          <Footer />

          <Modal 
            isOpen={isBookingOpen} 
            onClose={() => setIsBookingOpen(false)} 
            title="Book a Session"
          >
            <BookingForm onSuccess={() => setIsBookingOpen(false)} />
          </Modal>
        </div>
      </Router>
    </HelmetProvider>
  )
}

export default App
