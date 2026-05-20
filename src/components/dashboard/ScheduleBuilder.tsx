import React, { useState, useEffect } from "react";
import { therapistService } from "../../services/therapistService";
import { TherapistAvailabilityRule, TherapistOverride } from "../../types";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CalendarInfo, Clock, Settings, Save, Trash, CalendarOff, Plus, AlertCircle 
} from "lucide-react";

interface ScheduleBuilderProps {
  therapistId: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const ScheduleBuilder: React.FC<ScheduleBuilderProps> = ({ therapistId }) => {
  const [rules, setRules] = useState<TherapistAvailabilityRule[]>([]);
  const [overrides, setOverrides] = useState<TherapistOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New Rule State
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [duration, setDuration] = useState(60);
  const [cooldown, setCooldown] = useState(15);
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const fetchedRules = await therapistService.getAvailabilityRules(therapistId);
      const fetchedOverrides = await therapistService.getOverrides(therapistId);
      setRules(fetchedRules);
      setOverrides(fetchedOverrides);
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (therapistId) loadData();
  }, [therapistId]);

  const toggleDay = (idx: number) => {
    setSelectedDays(prev => 
      prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx]
    );
  };

  const calculatePreviewSlots = () => {
    const slots: string[] = [];
    if (!startTime || !endTime) return slots;
    
    // logic duplicated from useAvailability just for preview
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    let currentM = startH * 60 + startM;
    const endTotalM = endH * 60 + endM;

    let bStartM = breakStart ? parseInt(breakStart.split(':')[0])*60 + parseInt(breakStart.split(':')[1]) : 0;
    let bEndM = breakEnd ? parseInt(breakEnd.split(':')[0])*60 + parseInt(breakEnd.split(':')[1]) : 0;
    
    // sanity check
    if (duration <= 0) return slots;

    while (currentM + duration <= endTotalM) {
      const sStart = currentM;
      const sEnd = currentM + duration;

      if (breakStart && breakEnd && sStart < bEndM && sEnd > bStartM) {
        currentM = bEndM;
        continue;
      }

      const h = Math.floor(sStart / 60).toString().padStart(2, '0');
      const m = (sStart % 60).toString().padStart(2, '0');
      slots.push(`${h}:${m}`);
      currentM += duration + cooldown;
    }
    return slots;
  };

  const handleSaveRules = async () => {
    if (selectedDays.length === 0) return alert("Select at least one day");
    setSaving(true);
    try {
      const breaks = breakStart && breakEnd ? [{ startTime: breakStart, endTime: breakEnd }] : [];
      
      for (const day of selectedDays) {
        // check if rule for day exists
        const existing = rules.find(r => r.dayOfWeek === day);
        if (existing) {
          await therapistService.deleteAvailabilityRule(therapistId, existing.id);
        }
        
        await therapistService.saveAvailabilityRule(therapistId, {
          therapistId,
          dayOfWeek: day,
          isActive: true,
          startTime,
          endTime,
          slotDuration: duration,
          cooldownGap: cooldown,
          breaks
        });
      }
      setSelectedDays([]);
      await loadData();
    } catch (e) {
      console.error(e);
      alert("Failed to save rules.");
    }
    setSaving(false);
  };

  const handleDeleteRule = async (ruleId: string) => {
    setSaving(true);
    try {
      await therapistService.deleteAvailabilityRule(therapistId, ruleId);
      await loadData();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  if (loading) return <div className="p-10 flex justify-center"><div className="animate-pulse flex items-center gap-2"><Clock className="w-4 h-4" /> Loading Schedule...</div></div>;

  const previewSlots = calculatePreviewSlots();

  return (
    <div className="flex flex-col xl:flex-row gap-10 items-start font-sans text-primary relative">
      
      {/* BUILDER PANEL */}
      <div className="flex-1 bg-white p-8 md:p-12 rounded-[2.5rem] shadow-sm border border-primary/5 w-full">
        <h2 className="text-3xl font-serif tracking-tight mb-8">Weekly Schedule</h2>
        
        <div className="space-y-10">
          
          <section>
            <h3 className="text-sm font-bold uppercase tracking-widest text-primary/40 mb-4">1. Working Days</h3>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((day, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleDay(idx)}
                  className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all border ${
                    selectedDays.includes(idx) 
                      ? "bg-green-50 text-green-700 border-green-200 shadow-sm" 
                      : "bg-white text-primary/50 border-primary/10 hover:border-primary/30"
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-primary/40 mb-4">2. Working Hours</h3>
              <div className="flex items-center gap-4">
                <div className="flex-1 relative group">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/30" />
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full h-12 pl-12 pr-4 rounded-xl bg-[#FCFAF7] border-none focus:ring-2 focus:ring-primary/10 transition-all font-medium text-sm outline-none" />
                </div>
                <span className="text-primary/30">to</span>
                <div className="flex-1 relative group">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/30" />
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full h-12 pl-12 pr-4 rounded-xl bg-[#FCFAF7] border-none focus:ring-2 focus:ring-primary/10 transition-all font-medium text-sm outline-none" />
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-primary/40 mb-4">3. Session Length</h3>
              <div className="flex bg-[#FCFAF7] p-1.5 rounded-2xl w-max border border-primary/5">
                {[30, 45, 60, 90].map(val => (
                  <button
                    key={val}
                    onClick={() => setDuration(val)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                      duration === val ? "bg-white text-primary shadow-sm" : "text-primary/50 hover:text-primary"
                    }`}
                  >
                    {val}m
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-primary/5">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-primary/40 mb-4 flex items-center gap-2">
                4. Cooldown Gap
              </h3>
              <div className="flex bg-[#FCFAF7] p-1.5 rounded-2xl w-max border border-primary/5">
                {[0, 10, 15, 30].map(val => (
                  <button
                    key={val}
                    onClick={() => setCooldown(val)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                      cooldown === val ? "bg-white text-primary shadow-sm" : "text-primary/50 hover:text-primary"
                    }`}
                  >
                    {val}m
                  </button>
                ))}
              </div>
              <p className="text-xs text-primary/40 mt-2">Buffer time between sessions.</p>
            </div>
            
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-primary/40 mb-4">5. Lunch / Break</h3>
              <div className="flex items-center gap-4">
                <input type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} className="w-full h-12 px-4 rounded-xl bg-[#FCFAF7] border-none focus:ring-2 focus:ring-primary/10 transition-all font-medium text-sm outline-none" placeholder="Start" />
                <span className="text-primary/30">to</span>
                <input type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} className="w-full h-12 px-4 rounded-xl bg-[#FCFAF7] border-none focus:ring-2 focus:ring-primary/10 transition-all font-medium text-sm outline-none" placeholder="End" />
              </div>
            </div>
          </section>

          <div className="pt-6 border-t border-primary/5 flex justify-end">
            <button
              onClick={handleSaveRules}
              disabled={saving || selectedDays.length === 0}
              className="h-12 px-8 rounded-xl bg-primary text-white text-sm font-bold uppercase tracking-wider hover:bg-primary/90 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? "Saving..." : <><Save className="w-4 h-4" /> Apply Schedule</>}
            </button>
          </div>
          
        </div>
      </div>

      {/* RIGHT PANEL - LIVE PREVIEW & ACTIVE RULES */}
      <div className="w-full xl:w-96 space-y-8 shrink-0">
        
        {/* LIVE PREVIEW */}
        <div className="bg-[#FCFAF7] rounded-[2.5rem] p-8 border border-primary/5">
          <h3 className="font-serif text-xl mb-4 flex items-center gap-2 tracking-tight">
            <Settings className="w-4 h-4 text-primary/40" /> Live Preview
          </h3>
          {previewSlots.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {previewSlots.map(time => (
                <div key={time} className="px-3 py-1.5 bg-white border border-primary/10 rounded-lg text-xs font-bold text-primary shadow-sm">
                  {time}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-primary/40 italic">Set your hours to see generated slots.</p>
          )}
          <div className="mt-4 text-xs font-medium text-primary/40 flex items-center gap-2">
            <AlertCircle className="w-3 h-3" /> Generates {previewSlots.length} daily slots.
          </div>
        </div>

        {/* ACTIVE RULES */}
        <div className="bg-white rounded-[2.5rem] p-8 border border-primary/5">
          <h3 className="font-serif text-xl mb-6 flex items-center gap-2 tracking-tight">
            <CalendarInfo className="w-4 h-4 text-[#E6A520]" /> Configured Rules
          </h3>
          <div className="space-y-3">
            {rules.length === 0 ? (
              <p className="text-sm text-primary/40 italic">No recurring days configured.</p>
            ) : (
              DAYS.map((dayName, idx) => {
                const rule = rules.find(r => r.dayOfWeek === idx);
                if (!rule) return null;
                return (
                  <div key={rule.id} className="flex flex-col p-4 bg-[#FCFAF7] rounded-2xl border border-primary/5 gap-2 group">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold uppercase tracking-widest text-primary/60">{dayName}</div>
                      <button onClick={() => handleDeleteRule(rule.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-primary/30 hover:text-red-500">
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="font-medium text-sm">{rule.startTime} - {rule.endTime}</div>
                    <div className="text-xs text-primary/50 flex gap-2">
                      <span>{rule.slotDuration}m sessions</span>
                      {rule.cooldownGap > 0 && <span>• {rule.cooldownGap}m break</span>}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* OVERRIDES */}
        <div className="bg-white rounded-[2.5rem] p-8 border border-primary/5">
          <h3 className="font-serif text-xl mb-6 flex items-center gap-2 tracking-tight">
            <CalendarOff className="w-4 h-4 text-red-500" /> Day Overrides
          </h3>
          <div className="space-y-4">
             <div className="text-sm font-medium text-primary/60">Block off a specific date:</div>
             <div className="flex gap-2">
                <input 
                  type="date" 
                  id="overrideDate"
                  className="flex-1 h-10 px-3 rounded-xl bg-[#FCFAF7] border border-primary/10 text-sm outline-none" 
                />
                <button 
                  onClick={async () => {
                    const el = document.getElementById("overrideDate") as HTMLInputElement;
                    if (!el.value) return;
                    setSaving(true);
                    try {
                      await therapistService.saveOverride(therapistId, {
                         therapistId,
                         date: el.value,
                         type: 'blocked',
                         reason: 'Blocked Day'
                      });
                      el.value = "";
                      await loadData();
                    } catch (e) {
                      console.error(e);
                    }
                    setSaving(false);
                  }}
                  disabled={saving}
                  className="h-10 px-4 rounded-xl bg-red-50 text-red-600 font-bold text-xs hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  Block
                </button>
             </div>

             <div className="space-y-2 mt-4">
               {overrides.length === 0 ? (
                 <p className="text-xs text-primary/40 italic">No blocked dates.</p>
               ) : (
                 overrides.map(o => (
                   <div key={o.id} className="flex items-center justify-between p-3 rounded-xl bg-red-50/50 border border-red-100">
                     <span className="text-sm font-bold text-red-800">{o.date}</span>
                     <button onClick={async () => {
                       setSaving(true);
                       await therapistService.deleteOverride(therapistId, o.id);
                       await loadData();
                       setSaving(false);
                     }} className="text-red-400 hover:text-red-600">
                       <Trash className="w-3.5 h-3.5" />
                     </button>
                   </div>
                 ))
               )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
