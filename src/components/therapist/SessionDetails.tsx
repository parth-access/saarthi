import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card"
import { motion } from "motion/react"
import { Globe, Users } from "lucide-react"

interface SessionDetailsProps {
  mode: string
  clients: string[]
}

const SessionDetails = ({ mode, clients }: SessionDetailsProps) => {
  return (
    <section id="session-details" className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-primary font-serif italic">Session Details</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Information about the mode of therapy and the types of clients I work with.
          </p>
        </div>
        
        <div className="grid gap-8 sm:grid-cols-2 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <Card className="h-full border-none shadow-none bg-primary/5 p-12 rounded-3xl">
              <CardHeader className="flex flex-row items-center gap-6 space-y-0 mb-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <Globe className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-2xl font-serif">Mode</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-medium text-primary">{mode}</p>
                <p className="mt-2 text-muted-foreground">Professional online sessions for accessibility and convenience.</p>
              </CardContent>
            </Card>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <Card className="h-full border-none shadow-none bg-accent/5 p-12 rounded-3xl">
              <CardHeader className="flex flex-row items-center gap-6 space-y-0 mb-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <Users className="h-8 w-8 text-accent" />
                </div>
                <CardTitle className="text-2xl font-serif text-accent">Clients</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {clients.map((client) => (
                    <span key={client} className="px-4 py-2 rounded-full bg-white text-sm font-medium text-accent border border-accent/10">
                      {client}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-muted-foreground">I work with individuals, couples, families, and teenagers.</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default SessionDetails
