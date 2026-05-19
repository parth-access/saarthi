"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase/client";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { toast } from "sonner";
import { User, Bell, Shield, Camera, Home, ArrowLeft, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Profile() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");

  // Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [notifications, setNotifications] = useState({
    email: true,
    sms: false,
    reminders: true,
  });

  useEffect(() => {
    if (!currentUser) return;
    const fetchProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setProfileData(data);
          setName(data.name || "");
          setPhone(data.phone || "");
          setBio(data.bio || "");
          if (data.notifications) {
            setNotifications(data.notifications);
          }
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [currentUser]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        name,
        phone,
        bio,
        notifications,
      });
      toast.success("Profile gently updated.");
    } catch (err) {
      console.error("Failed to update profile", err);
      toast.error("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-32 pb-24 bg-[#FFFBE7] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#E6A520] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-24 bg-[#FFFBE7]">
      <div className="container mx-auto px-6 max-w-4xl">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-primary/60 hover:text-primary mb-8 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Dashboard
        </button>

        <div className="flex flex-col md:flex-row gap-8 items-start">
          {/* Sidebar */}
          <div className="w-full md:w-64 shrink-0 space-y-2">
            {[
              { id: "personal", label: "Personal Info", icon: User },
              { id: "notifications", label: "Notifications", icon: Bell },
              { id: "security", label: "Security & Privacy", icon: Shield },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-white text-primary shadow-sm border border-primary/10 transition-colors"
                    : "text-primary/60 hover:text-primary hover:bg-white/50"
                }`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? "text-[#E6A520]" : "text-primary/40"}`} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 bg-white rounded-3xl p-8 md:p-10 border border-primary/10 shadow-sm relative w-full"
          >
            {activeTab === "personal" && (
              <form onSubmit={handleSave} className="space-y-8">
                <div>
                  <h2 className="text-2xl font-serif text-primary mb-2">Personal Information</h2>
                  <p className="text-primary/60 text-sm">Update your details to help us personalize your experience.</p>
                </div>

                <div className="flex items-center gap-6 pb-6 border-b border-primary/5">
                  <div className="relative group cursor-pointer">
                    <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center text-3xl font-serif text-primary border border-primary/10 overflow-hidden">
                      {name ? name.charAt(0).toUpperCase() : "U"}
                    </div>
                    <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-medium text-primary">Profile Picture</h3>
                    <p className="text-xs text-primary/50 mt-1">PNG, JPG up to 5MB</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-primary">Full Name</label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-[#FFFBE7]/50"
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-primary">Email Address</label>
                    <Input
                      value={currentUser?.email || ""}
                      readOnly
                      disabled
                      className="bg-primary/5 text-primary/50 cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-primary">Phone Number</label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="bg-[#FFFBE7]/50"
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-primary">Personal Bio (Optional)</label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className="w-full min-h-[100px] p-3 rounded-xl border border-input bg-[#FFFBE7]/50 text-sm focus:outline-none focus:ring-2 focus:ring-[#E6A520] transition-colors resize-none placeholder:text-muted-foreground/50"
                      placeholder="Share a bit about yourself..."
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={saving} className="gap-2 shrink-0">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            )}

            {activeTab === "notifications" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl font-serif text-primary mb-2">Notification Preferences</h2>
                  <p className="text-primary/60 text-sm">Control how you&apos;d like to be contacted.</p>
                </div>

                <div className="space-y-4">
                  {[
                    { id: "email", title: "Email Notifications", desc: "Receive booking confirmations and updates via email." },
                    { id: "sms", title: "SMS Alerts", desc: "Get text messages for upcoming session reminders." },
                    { id: "reminders", title: "Session Reminders", desc: "Receive a nudge 24 hours before your session." },
                  ].map((item) => (
                    <div key={item.id} className="flex items-start justify-between p-4 rounded-2xl bg-[#FFFBE7]/50 border border-primary/5 hover:border-primary/10 transition-colors">
                      <div>
                        <h3 className="font-medium text-primary text-sm">{item.title}</h3>
                        <p className="text-xs text-primary/60 mt-1">{item.desc}</p>
                      </div>
                      <button
                        onClick={() => {
                          setNotifications(p => ({ ...p, [item.id]: !p[item.id as keyof typeof p] }));
                        }}
                        className={`w-11 h-6 rounded-full transition-colors relative ${notifications[item.id as keyof typeof notifications] ? "bg-[#E6A520]" : "bg-primary/20"}`}
                      >
                         <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${notifications[item.id as keyof typeof notifications] ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-4">
                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Preferences
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "security" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl font-serif text-primary mb-2">Security & Privacy</h2>
                  <p className="text-primary/60 text-sm">Manage your password and session security.</p>
                </div>

                <div className="p-5 rounded-2xl border border-primary/10 bg-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-primary text-sm flex items-center gap-2">
                         <Shield className="w-4 h-4 text-[#E6A520]" />
                         Password
                      </h3>
                      <p className="text-xs text-primary/60 mt-1">Last changed: A while ago</p>
                    </div>
                    <Button variant="outline" size="sm">Update Password</Button>
                  </div>
                </div>
                
                <div className="p-5 rounded-2xl border border-red-100 bg-red-50/50">
                  <h3 className="font-medium text-red-700 text-sm">Danger Zone</h3>
                  <p className="text-xs text-red-600/70 mt-1 mb-4">Once you delete your account, there is no going back. Please be certain.</p>
                  <Button variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-100">Delete Account</Button>
                </div>
              </div>
            )}

          </motion.div>
        </div>
      </div>
    </div>
  );
}
