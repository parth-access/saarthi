import React, { useState, useEffect } from "react";
import { therapistService } from "../../services/therapistService";
import { TherapistAvailabilityRule, TherapistOverride } from "../../types";
import { generateTimeSlots } from "../../shared/scheduling/slots";
import {
  CalendarDays,
  Clock,
  Save,
  Trash2,
  CalendarOff,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface ScheduleBuilderProps {
  therapistId: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const ScheduleBuilder: React.FC<ScheduleBuilderProps> = ({ therapistId }) => {
  const [rules, setRules] = useState<TherapistAvailabilityRule[]>([]);
  const [overrides, setOverrides] = useState<TherapistOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overrideDate, setOverrideDate] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // New Rule State - standard Saarthi session length is 45 minutes
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [duration, setDuration] = useState(45);
  const [cooldown, setCooldown] = useState(15);
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");

  const loadData = React.useCallback(async () => {
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
  }, [therapistId]);

  useEffect(() => {
    if (therapistId) loadData();
  }, [therapistId, loadData]);

  const toggleDay = (idx: number) => {
    setSelectedDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]
    );
  };

  /**
   * Preview of the start times this rule will actually produce. Calls the same
   * `generateTimeSlots` that availability queries run.
   */
  const calculatePreviewSlots = () => {
    if (!startTime || !endTime) return [];
    const breaks = breakStart && breakEnd ? [{ startTime: breakStart, endTime: breakEnd }] : [];
    return generateTimeSlots(startTime, endTime, duration, cooldown, breaks);
  };

  const handleSaveRules = async () => {
    if (selectedDays.length === 0) {
      alert("Please select at least one working day.");
      return;
    }
    setSaving(true);
    try {
      const breaks = breakStart && breakEnd ? [{ startTime: breakStart, endTime: breakEnd }] : [];

      for (const day of selectedDays) {
        // check if rule for day exists
        const existing = rules.find((r) => r.dayOfWeek === day);
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
          breaks,
        });
      }
      setSelectedDays([]);
      await loadData();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error(e);
      alert("Failed to save rules. Please try again.");
    }
    setSaving(false);
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Are you sure you want to remove this day rule?")) return;
    setSaving(true);
    try {
      await therapistService.deleteAvailabilityRule(therapistId, ruleId);
      await loadData();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleBlockDate = async () => {
    if (!overrideDate) return;
    setSaving(true);
    try {
      await therapistService.saveOverride(therapistId, {
        therapistId,
        date: overrideDate,
        type: "blocked",
        reason: "Blocked Day",
      });
      setOverrideDate("");
      await loadData();
    } catch (e) {
      console.error(e);
      alert("Failed to block date.");
    }
    setSaving(false);
  };

  const handleDeleteOverride = async (overrideId: string) => {
    setSaving(true);
    try {
      await therapistService.deleteOverride(therapistId, overrideId);
      await loadData();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
        Loading schedule configuration...
      </div>
    );
  }

  const previewSlots = calculatePreviewSlots();

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start font-sans text-primary">
      {/* BUILDER PANEL */}
      <div className="flex-1 w-full space-y-6">
        <div className="rounded-xl border border-hairline bg-white p-5 md:p-6 shadow-sm">
          <div className="border-b border-hairline pb-4 mb-6 flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold text-primary font-serif">
                Configure Working Schedule
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Set recurring hours and slot intervals. The platform generates bookable start times
                matching your configuration.
              </p>
            </div>
            {saveSuccess && (
              <span className="inline-flex items-center gap-1 rounded bg-success-surface px-2.5 py-1 text-xs font-medium text-success animate-in fade-in">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            )}
          </div>

          <div className="space-y-6">
            {/* 1. Working Days */}
            <section>
              <label className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary/60 mb-2">
                1. Working Days
              </label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day, idx) => {
                  const isSelected = selectedDays.includes(idx);
                  const hasExistingRule = rules.some((r) => r.dayOfWeek === idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDay(idx)}
                      className={cn(
                        "h-9 px-3.5 rounded-lg text-xs font-semibold transition-all border",
                        isSelected
                          ? "bg-primary text-white border-primary shadow-sm"
                          : hasExistingRule
                          ? "bg-neutral-surface/80 text-primary border-hairline hover:border-primary/40"
                          : "bg-white text-muted-foreground border-hairline hover:text-primary hover:border-primary/30"
                      )}
                      title={hasExistingRule ? `${day} already has a rule configured` : day}
                    >
                      {SHORT_DAYS[idx]}
                      {hasExistingRule && !isSelected && (
                        <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-success align-middle" />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
                Green dot indicates days currently configured with working hours.
              </p>
            </section>

            {/* 2. Working Hours & Duration */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-hairline">
              <div>
                <label className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary/60 mb-2">
                  2. Working Hours (IST)
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full h-9 pl-9 pr-3 rounded-lg bg-neutral-surface/40 border border-hairline text-xs font-medium text-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">to</span>
                  <div className="relative flex-1">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full h-9 pl-9 pr-3 rounded-lg bg-neutral-surface/40 border border-hairline text-xs font-medium text-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary/60 mb-2">
                  3. Session Duration
                </label>
                <div className="flex gap-1.5">
                  {[30, 45, 60, 90].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDuration(val)}
                      className={cn(
                        "h-9 flex-1 rounded-lg text-xs font-medium transition-all border",
                        duration === val
                          ? "bg-primary text-white border-primary shadow-sm font-semibold"
                          : "bg-neutral-surface/40 text-muted-foreground border-hairline hover:text-primary hover:bg-white"
                      )}
                    >
                      {val}m
                      {val === 45 && (
                        <span className="block text-[0.625rem] opacity-80 font-normal">
                          Standard
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* 4. Buffer Gap & Breaks */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-hairline">
              <div>
                <label className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary/60 mb-2">
                  4. Cooldown Buffer Between Sessions
                </label>
                <div className="flex gap-1.5">
                  {[0, 10, 15, 30].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setCooldown(val)}
                      className={cn(
                        "h-9 flex-1 rounded-lg text-xs font-medium transition-all border",
                        cooldown === val
                          ? "bg-primary text-white border-primary shadow-sm font-semibold"
                          : "bg-neutral-surface/40 text-muted-foreground border-hairline hover:text-primary hover:bg-white"
                      )}
                    >
                      {val === 0 ? "None" : `${val}m`}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
                  Rest or notes interval between consecutive appointments.
                </p>
              </div>

              <div>
                <label className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary/60 mb-2">
                  5. Daily Break Window (Optional)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={breakStart}
                    onChange={(e) => setBreakStart(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-neutral-surface/40 border border-hairline text-xs font-medium text-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                    placeholder="Break start"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <input
                    type="time"
                    value={breakEnd}
                    onChange={(e) => setBreakEnd(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-neutral-surface/40 border border-hairline text-xs font-medium text-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                    placeholder="Break end"
                  />
                </div>
                <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
                  No slots will be bookable during this window.
                </p>
              </div>
            </section>

            {/* Commit Action */}
            <div className="pt-4 border-t border-hairline flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {selectedDays.length === 0
                  ? "Select days above to apply schedule"
                  : `Applying to ${selectedDays.length} day(s)`}
              </span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSaveRules}
                disabled={saving || selectedDays.length === 0}
                className="gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Weekly Schedule
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE PANEL - LIVE PREVIEW & ACTIVE CONFIG */}
      <div className="w-full xl:w-88 space-y-4 shrink-0">
        {/* LIVE PREVIEW OF SLOTS */}
        <div className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-primary/60 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              Generated Start Times
            </h3>
            <span className="tabular text-xs font-medium text-primary/70">
              {previewSlots.length} slots/day
            </span>
          </div>
          {previewSlots.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
              {previewSlots.map((time) => (
                <span
                  key={time}
                  className="tabular rounded bg-neutral-surface px-2 py-0.5 font-mono text-[0.6875rem] font-medium text-primary/80 border border-hairline"
                >
                  {time}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Adjust your hours and session length to preview calculated slots.
            </p>
          )}
          <p className="mt-3 text-[0.6875rem] text-muted-foreground leading-relaxed">
            Standard Saarthi session length is 45 minutes plus cooldown buffer.
          </p>
        </div>

        {/* CURRENT CONFIGURED RULES */}
        <div className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-primary/60 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-primary" />
              Active Weekly Rules
            </h3>
            <span className="tabular text-xs font-medium text-primary/70">
              {rules.length} configured
            </span>
          </div>

          <div className="space-y-2">
            {rules.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No recurring rules active. Clients cannot book until at least one day is saved.
              </p>
            ) : (
              DAYS.map((dayName, idx) => {
                const rule = rules.find((r) => r.dayOfWeek === idx);
                if (!rule) return null;
                return (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-surface/40 border border-hairline text-xs"
                  >
                    <div>
                      <span className="font-semibold text-primary">{dayName}</span>
                      <p className="text-[0.6875rem] text-muted-foreground mt-0.5 tabular">
                        {rule.startTime} – {rule.endTime} ({rule.slotDuration}m sessions
                        {rule.cooldownGap > 0 ? `, +${rule.cooldownGap}m rest` : ""})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      disabled={saving}
                      aria-label={`Delete rule for ${dayName}`}
                      className="p-1.5 text-muted-foreground hover:text-danger rounded hover:bg-neutral-surface transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* BLOCKED DATE OVERRIDES */}
        <div className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-primary/60 flex items-center gap-1.5">
              <CalendarOff className="h-3.5 w-3.5 text-danger" />
              Blocked Dates
            </h3>
            <span className="tabular text-xs font-medium text-primary/70">
              {overrides.length} blocked
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={overrideDate}
                onChange={(e) => setOverrideDate(e.target.value)}
                className="flex-1 h-9 px-3 rounded-lg bg-neutral-surface/40 border border-hairline text-xs text-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleBlockDate}
                disabled={saving || !overrideDate}
              >
                Block Date
              </Button>
            </div>

            <div className="space-y-1.5 mt-2">
              {overrides.length === 0 ? (
                <p className="text-[0.6875rem] text-muted-foreground italic">
                  No date overrides. All configured recurring days are bookable.
                </p>
              ) : (
                overrides.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-danger-surface/60 border border-danger/20 text-xs"
                  >
                    <span className="tabular font-medium text-danger">{o.date}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteOverride(o.id)}
                      disabled={saving}
                      aria-label={`Unblock ${o.date}`}
                      className="p-1 text-danger/70 hover:text-danger rounded transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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

