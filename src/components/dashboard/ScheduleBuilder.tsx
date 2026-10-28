import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  therapistAvailabilityService,
  type ScheduleChangeRequest,
} from "../../services/therapistAvailabilityService";
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
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

interface ScheduleBuilderProps {
  therapistId: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Today in India as YYYY-MM-DD: the earliest date worth closing. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

function prettyDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

/** Changes waiting on the therapist's "yes", and what the server said they do. */
interface PendingChanges {
  title: string;
  notes: string[];
  changes: ScheduleChangeRequest[];
  /** True once the server has assessed the impact, so the retry acknowledges it. */
  acknowledge: boolean;
}

export const ScheduleBuilder: React.FC<ScheduleBuilderProps> = ({ therapistId }) => {
  const [rules, setRules] = useState<TherapistAvailabilityRule[]>([]);
  const [overrides, setOverrides] = useState<TherapistOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [overrideDate, setOverrideDate] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [pending, setPending] = useState<PendingChanges | null>(null);

  // New Rule State - standard Saarthi session length is 45 minutes
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [duration, setDuration] = useState(45);
  const [cooldown, setCooldown] = useState(15);
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");

  const loadData = React.useCallback(async () => {
    setLoadError(null);
    try {
      const [fetchedRules, fetchedOverrides] = await Promise.all([
        therapistAvailabilityService.getAvailabilityRules(therapistId),
        therapistAvailabilityService.getOverrides(therapistId),
      ]);
      setRules(fetchedRules);
      setOverrides(fetchedOverrides);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Your schedule could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [therapistId]);

  useEffect(() => {
    if (therapistId) loadData();
  }, [therapistId, loadData]);

  const toggleDay = (idx: number) => {
    const adding = !selectedDays.includes(idx);
    // Picking a day that already has hours, on its own, loads those hours to edit.
    const existing = rules.find((r) => r.dayOfWeek === idx);
    if (adding && selectedDays.length === 0 && existing) {
      setStartTime(existing.startTime);
      setEndTime(existing.endTime);
      setDuration(existing.slotDuration);
      setCooldown(existing.cooldownGap);
      setBreakStart(existing.breaks?.[0]?.startTime ?? "");
      setBreakEnd(existing.breaks?.[0]?.endTime ?? "");
    }
    setSelectedDays((prev) => (adding ? [...prev, idx] : prev.filter((d) => d !== idx)));
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

  /**
   * Send changes one at a time through the validated schedule endpoint. When
   * the server says a change needs a person's judgement (sessions already
   * booked outside the new hours, or no hours left at all) nothing is written:
   * the rest wait in a dialog for the therapist's "yes".
   */
  const runChanges = async (changes: ScheduleChangeRequest[], acknowledge: boolean, title: string) => {
    setSaving(true);
    try {
      for (let i = 0; i < changes.length; i++) {
        const result = await therapistAvailabilityService.writeSchedule({
          ...changes[i],
          acknowledgeImpact: acknowledge,
        });
        if (!result.applied) {
          setPending({ title, notes: result.notes ?? [], changes: changes.slice(i), acknowledge: true });
          await loadData();
          return false;
        }
        for (const warning of result.warnings ?? []) toast.warning(warning);
      }
      setPending(null);
      await loadData();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That change did not go through. Please try again.");
      await loadData();
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRules = async () => {
    if (selectedDays.length === 0) {
      toast.error("Pick at least one working day.");
      return;
    }
    const breaks = breakStart && breakEnd ? [{ startTime: breakStart, endTime: breakEnd }] : [];
    const changes: ScheduleChangeRequest[] = [...selectedDays].sort().map((day) => ({
      action: "save_rule",
      // Replacing a day's hours edits its rule in place, in one write, so a
      // failure can never leave the day with no hours at all.
      ruleId: rules.find((r) => r.dayOfWeek === day)?.id ?? null,
      rule: {
        dayOfWeek: day,
        isActive: true,
        startTime,
        endTime,
        slotDuration: duration,
        cooldownGap: cooldown,
        breaks,
      },
    }));
    if (await runChanges(changes, false, "Save these hours?")) {
      setSelectedDays([]);
      setSaveSuccess(true);
      toast.success("Working hours saved.");
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handleDeleteRule = (rule: TherapistAvailabilityRule) => {
    setPending({
      title: `Remove ${DAYS[rule.dayOfWeek]}?`,
      notes: [`Clients will no longer be able to book you on ${DAYS[rule.dayOfWeek]}s. Sessions already booked are not changed.`],
      changes: [{ action: "delete_rule", ruleId: rule.id }],
      acknowledge: false,
    });
  };

  const handleBlockDate = async () => {
    if (!overrideDate) return;
    const ok = await runChanges(
      [{ action: "save_override", overrideId: null, override: { date: overrideDate, type: "blocked", reason: "Blocked Day" } }],
      false,
      `Close ${prettyDate(overrideDate)}?`
    );
    if (ok) {
      toast.success(`${prettyDate(overrideDate)} is closed.`);
      setOverrideDate("");
    }
  };

  const handleDeleteOverride = async (override: TherapistOverride) => {
    if (await runChanges([{ action: "delete_override", overrideId: override.id }], false, "Reopen this date?")) {
      toast.success(`${prettyDate(override.date)} is open again.`);
    }
  };

  const confirmPending = async () => {
    if (!pending) return;
    if (await runChanges(pending.changes, pending.acknowledge, pending.title)) {
      setSelectedDays([]);
      setOverrideDate("");
      toast.success("Schedule updated.");
    }
  };

  const today = istToday();
  const upcomingOverrides = overrides
    .filter((o) => o.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
        Loading your schedule…
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-danger/20 bg-danger-surface/40 px-5 py-6 text-center">
        <p className="text-sm font-medium text-danger">Your schedule could not be loaded.</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{loadError}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLoading(true); void loadData(); }}>
          Try again
        </Button>
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
                      onClick={() => handleDeleteRule(rule)}
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
              {upcomingOverrides.length} upcoming
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={overrideDate}
                min={today}
                aria-label="Date to close"
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
              {upcomingOverrides.length === 0 ? (
                <p className="text-[0.6875rem] text-muted-foreground italic">
                  No closed dates coming up. All your working days are bookable.
                </p>
              ) : (
                upcomingOverrides.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-danger-surface/60 border border-danger/20 text-xs"
                  >
                    <span className="tabular font-medium text-danger">
                      {prettyDate(o.date)}
                      {o.type === "available" && <span className="ml-1 font-normal text-muted-foreground">(special hours)</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleDeleteOverride(o)}
                      disabled={saving}
                      aria-label={`Reopen ${prettyDate(o.date)}`}
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
      <Modal isOpen={pending !== null} onClose={() => !saving && setPending(null)} title={pending?.title ?? ""}>
        <div className="space-y-4 text-sm">
          {pending && pending.notes.length > 0 && (
            <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
              {pending.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPending(null)} disabled={saving}>
              Keep as is
            </Button>
            <Button onClick={() => void confirmPending()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Yes, go ahead
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

