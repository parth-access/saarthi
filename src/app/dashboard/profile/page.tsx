"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { sendPasswordResetEmail, updateProfile } from "firebase/auth";
import { auth, db } from "@/lib/firebase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SupportModal } from "@/components/dashboard/SupportModal";
import { toast } from "sonner";
import { User, Mail, Shield, ArrowLeft, Loader2, Save, CheckCircle } from "lucide-react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

type Tab = "personal" | "communications" | "security";

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: "personal", label: "Personal info", icon: User },
  { id: "communications", label: "Communications", icon: Mail },
  { id: "security", label: "Security & privacy", icon: Shield },
];

function initialsFrom(name: string, email?: string | null): string {
  const n = name.trim();
  if (n) {
    return n.split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("");
  }
  return (email || "U").charAt(0).toUpperCase();
}

function Profile() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("personal");
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportMessage, setSupportMessage] = useState("");
  const openSupport = (prefill: string) => { setSupportMessage(prefill); setSupportOpen(true); };
  const [sendingReset, setSendingReset] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");

  /** Sign-in method actually used by this account — drives the security options. */
  const usesPassword = useMemo(
    () => (auth?.currentUser?.providerData || []).some((p) => p.providerId === "password"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auth?.currentUser?.uid, loading]
  );

  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    const fetchProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        let dbName = "";
        let dbPhone = "";
        let dbBio = "";
        if (userDoc.exists()) {
          const data = userDoc.data();
          dbName = data.name || "";
          dbPhone = data.phone || "";
          dbBio = data.bio || "";
        }
        if (!active) return;
        setName(dbName);
        setPhone(dbPhone);
        setBio(dbBio);

        // Fall back to the details on the user's most recent booking so the form
        // isn't blank for people who booked before ever opening this page.
        if (!dbName && !dbPhone && currentUser.email) {
          const snap = await getDocs(
            query(collection(db, "bookings"), where("email", "==", currentUser.email))
          );
          if (!snap.empty && active) {
            const rows = snap.docs
              .map((d) => d.data() as { name?: string; phone?: string; createdAt?: { seconds: number } })
              .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            if (!dbName && rows[0]?.name) setName(rows[0].name);
            if (!dbPhone && rows[0]?.phone) setPhone(rows[0].phone);
          }
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
        toast.error("We could not load your profile just now. Please refresh the page.");
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchProfile();
    return () => { active = false; };
  }, [currentUser]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const trimmed = name.trim();
    setSaving(true);
    try {
      await setDoc(
        doc(db, "users", currentUser.uid),
        {
          name: trimmed,
          phone: phone.trim(),
          bio: bio.trim(),
          email: currentUser.email,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      // Keep the Firebase Auth display name in step so the header/avatar match.
      if (auth?.currentUser && trimmed && auth.currentUser.displayName !== trimmed) {
        try {
          await updateProfile(auth.currentUser, { displayName: trimmed });
        } catch {
          /* non-fatal: the Firestore profile is the source of truth for display */
        }
      }
      toast.success("Your details have been saved.");
    } catch (err) {
      console.error("Failed to update profile", err);
      toast.error("We could not save your details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!currentUser?.email || !auth) return;
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, currentUser.email);
      toast.success(`We've sent a password reset link to ${currentUser.email}.`);
    } catch (err) {
      console.error("Password reset failed", err);
      toast.error("We could not send the reset email. Please try again in a moment.");
    } finally {
      setSendingReset(false);
    }
  };
  if (loading) {
    return (
      <div className="pt-28 pb-24 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#E6A520] animate-spin" />
      </div>
    );
  }

  return (
    <div className="pt-24 pb-24">
      <div className="container mx-auto px-4 sm:px-6 max-w-4xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-primary/60 hover:text-primary mb-8 transition-colors group font-sans"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to dashboard
        </Link>

        <div className="flex flex-col md:flex-row gap-8 items-start">
          {/* Tabs */}
          <nav aria-label="Profile sections" className="w-full md:w-64 shrink-0 space-y-2 font-sans">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-white text-primary shadow-sm border border-primary/10"
                    : "text-primary/60 hover:text-primary hover:bg-white/50"
                }`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? "text-[#E6A520]" : "text-primary/40"}`} />
                {tab.label}
              </button>
            ))}
          </nav>

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 bg-white rounded-3xl p-6 sm:p-8 md:p-10 border border-primary/10 shadow-sm relative w-full"
          >
            {activeTab === "personal" && (
              <form onSubmit={handleSave} className="space-y-8">
                <div>
                  <h2 className="text-2xl font-serif text-primary mb-2">Personal information</h2>
                  <p className="text-primary/60 text-sm font-sans">
                    These details are used on your bookings and in the emails we send you.
                  </p>
                </div>

                <div className="flex items-center gap-6 pb-6 border-b border-primary/5">
                  <div
                    aria-hidden="true"
                    className="w-20 h-20 rounded-full bg-[#FFFBE7] flex items-center justify-center text-2xl font-serif text-[#E6A520] border border-primary/10 shrink-0"
                  >
                    {initialsFrom(name, currentUser?.email)}
                  </div>
                  <div className="font-sans">
                    <h3 className="font-medium text-primary text-sm">Your avatar</h3>
                    <p className="text-xs text-primary/50 mt-1">
                      We use your initials across Saarthi — there&apos;s nothing to upload.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
                  <div className="space-y-2">
                    <label htmlFor="profile-name" className="text-sm font-medium text-primary">Full name</label>
                    <Input
                      id="profile-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-[#FFFBE7]/50"
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="profile-email" className="text-sm font-medium text-primary">Email address</label>
                    <Input
                      id="profile-email"
                      value={currentUser?.email || ""}
                      readOnly
                      disabled
                      className="bg-primary/5 text-primary/50 cursor-not-allowed"
                    />
                    <p className="text-xs text-primary/40">
                      Your email identifies your sessions, so it can&apos;t be changed here.
                    </p>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label htmlFor="profile-phone" className="text-sm font-medium text-primary">Phone number</label>
                    <Input
                      id="profile-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="bg-[#FFFBE7]/50"
                      placeholder="+91 99999 99999"
                      autoComplete="tel"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label htmlFor="profile-bio" className="text-sm font-medium text-primary">
                      Anything you&apos;d like your therapist to know <span className="text-primary/40 font-normal">(optional)</span>
                    </label>
                    <textarea
                      id="profile-bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      maxLength={1000}
                      className="w-full min-h-[100px] p-3 rounded-xl border border-input bg-[#FFFBE7]/50 text-sm focus:outline-none focus:ring-2 focus:ring-[#E6A520] transition-colors resize-none placeholder:text-muted-foreground/50 font-sans"
                      placeholder="Share a bit about yourself…"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={saving} className="gap-2 shrink-0 cursor-pointer">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            )}
            {activeTab === "communications" && (
              <div className="space-y-8 font-sans">
                <div>
                  <h2 className="text-2xl font-serif text-primary mb-2">Communications</h2>
                  <p className="text-primary/60 text-sm">
                    Exactly what Saarthi sends you, and where it goes.
                  </p>
                </div>

                <div className="rounded-2xl bg-[#FFFBE7]/60 border border-primary/10 p-4 flex items-start gap-3">
                  <Mail className="w-5 h-5 text-[#E6A520] shrink-0 mt-0.5" />
                  <div className="text-sm text-primary/70">
                    Everything goes to <span className="font-medium text-primary">{currentUser?.email}</span>.
                  </div>
                </div>

                <ul className="space-y-3">
                  {[
                    {
                      title: "Booking confirmation",
                      desc: "Sent as soon as your session is confirmed, with the date, time and your Google Meet link.",
                    },
                    {
                      title: "Session reminder",
                      desc: "A nudge 30 minutes before your session starts, so it doesn't slip by.",
                    },
                    {
                      title: "Calendar invite",
                      desc: "A Google Calendar event for your session, including the Meet link.",
                    },
                    {
                      title: "Changes you make",
                      desc: "Reschedules and cancellations are confirmed by email, including any refund we start.",
                    },
                  ].map((item) => (
                    <li key={item.title} className="flex items-start gap-3 p-4 rounded-2xl bg-white border border-primary/5">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-medium text-primary text-sm">{item.title}</h3>
                        <p className="text-xs text-primary/60 mt-1 leading-relaxed">{item.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>

                <p className="text-xs text-primary/50 leading-relaxed">
                  These are the essential messages tied to sessions you&apos;ve booked, so there are no
                  toggles to switch off. We never send marketing email. If something isn&apos;t reaching
                  you, or you&apos;d like us to stop contacting you entirely,{" "}
                  <button
                    type="button"
                    onClick={() => openSupport("I have a question about the emails Saarthi sends me: ")}
                    className="font-medium text-primary underline hover:text-[#E6A520] cursor-pointer"
                  >
                    tell our care team
                  </button>{" "}
                  and a person will sort it out.
                </p>
              </div>
            )}
            {activeTab === "security" && (
              <div className="space-y-8 font-sans">
                <div>
                  <h2 className="text-2xl font-serif text-primary mb-2">Security &amp; privacy</h2>
                  <p className="text-primary/60 text-sm">How you sign in, and what to do about your data.</p>
                </div>

                <div className="p-5 rounded-2xl border border-primary/10 bg-white">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-medium text-primary text-sm flex items-center gap-2">
                        <Shield className="w-4 h-4 text-[#E6A520]" /> Password
                      </h3>
                      <p className="text-xs text-primary/60 mt-1 max-w-md leading-relaxed">
                        {usesPassword
                          ? "We'll email you a secure link to set a new password. Your current password keeps working until you use it."
                          : "You sign in with Google, so Saarthi never stores a password for your account. Manage it in your Google account settings."}
                      </p>
                    </div>
                    {usesPassword ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePasswordReset}
                        disabled={sendingReset}
                        className="cursor-pointer shrink-0 gap-2"
                      >
                        {sendingReset && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {sendingReset ? "Sending…" : "Email me a reset link"}
                      </Button>
                    ) : (
                      <span className="text-xs font-medium text-primary/50 shrink-0">Managed by Google</span>
                    )}
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-primary/10 bg-white">
                  <h3 className="font-medium text-primary text-sm">Your data</h3>
                  <p className="text-xs text-primary/60 mt-1 mb-3 leading-relaxed">
                    Session notes stay between you and your therapist. Read what we collect and why in our{" "}
                    <Link href="/privacy" className="font-medium text-primary underline hover:text-[#E6A520]">privacy policy</Link>.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-red-100 bg-red-50/50">
                  <h3 className="font-medium text-red-700 text-sm">Close your account</h3>
                  <p className="text-xs text-red-600/80 mt-1 mb-4 leading-relaxed">
                    Deleting an account touches booking and payment records we&apos;re required to keep for a
                    period, so a person handles it rather than a button. Send us a request and we&apos;ll confirm
                    what is removed and when.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openSupport("I would like to request deletion of my Saarthi account and associated data.")}
                    className="border-red-200 text-red-700 hover:bg-red-100 cursor-pointer"
                  >
                    Request account deletion
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <SupportModal
        isOpen={supportOpen}
        onClose={() => setSupportOpen(false)}
        userEmail={currentUser?.email || ""}
        userName={name}
        userPhone={phone}
        initialSubject="General Support"
        initialMessage={supportMessage}
      />
    </div>
  );
}

export default function ProfileRoute() {
  return (
    <ProtectedRoute allowedRoles={["client", "admin"]}>
      <Profile />
    </ProtectedRoute>
  );
}
