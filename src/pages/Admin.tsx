import * as React from "react"
import { Helmet } from "react-helmet-async"
import { motion } from "motion/react"
import { ShieldCheck } from "lucide-react"

const AdminPage = () => {
  return (
    <div className="pt-32 pb-24 min-h-screen bg-background selection:bg-primary/10">
      <Helmet>
        <title>Admin Dashboard | Saarthi</title>
      </Helmet>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-5xl md:text-6xl font-serif text-primary">Admin Preview</h1>
            <p className="text-xl text-muted-foreground font-sans mt-3">This is a frontend-only preview of the booking manager.</p>
          </div>
          <div className="flex gap-4">
            <div className="px-4 py-2 bg-white rounded-full border border-primary/10 shadow-sm text-sm font-medium flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Frontend-Only Mode
            </div>
          </div>
        </header>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-24 bg-white/50 rounded-[3rem] border border-dashed border-primary/20 flex flex-col items-center"
        >
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-primary/5 text-primary mb-6">
            <ShieldCheck className="h-10 w-10" />
          </div>
          <p className="text-3xl font-serif text-primary mb-4">Under Construction</p>
          <p className="text-muted-foreground max-w-md mx-auto">
            The administrative backend and real-time database have been removed to focus on a clean frontend core. 
            Backend logic can be rebuilt here based on project needs.
          </p>
        </motion.div>
      </div>
    </div>
  )
}

export default AdminPage
