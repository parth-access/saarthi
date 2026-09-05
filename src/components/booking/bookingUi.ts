/**
 * Pure, DOM-free helpers for the booking wizard.
 *
 * These carry the load-bearing display rules that used to live inline (and
 * duplicated) inside the step components, so they can be unit-tested in the
 * node test environment without a renderer. Nothing here touches booking,
 * payment, availability or validation *logic* — it is presentation only:
 *  - time formatting for the slot grid + review,
 *  - the single source of the displayed session price,
 *  - the slot-state → tone/label mapping behind the slot legend,
 *  - phone composition for the country-code selector (the wire value stays a
 *    single `phone` string; see DetailsStep).
 */

/** Session price as shown to the client. The server computes the real charge;
 *  this literal is display-only and must equal what the booking has always shown. */
export const SESSION_PRICE_DISPLAY = "₹1,500";

/** Confirm CTA label, built from the one price source so the two never drift. */
export const CONFIRM_CTA_LABEL = `Confirm & Pay ${SESSION_PRICE_DISPLAY}`;

/** Labels for the six selection steps (step 7 is the success screen). */
export const STEP_LABELS = [
  "Therapist",
  "Session",
  "Date",
  "Time",
  "Details",
  "Review",
] as const;

/**
 * "HH:MM" (24h) → "h:MM AM/PM". Returns the input unchanged if it cannot be
 * parsed, so a malformed slot string is shown verbatim rather than as "NaN".
 */
export function formatTime12h(time24: string): string {
  if (!time24) return "";
  try {
    const [hours, minutes] = time24.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time24;
    const period = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 || 12;
    return `${h12}:${minutes.toString().padStart(2, "0")} ${period}`;
  } catch {
    return time24;
  }
}

/** Visual tone for a slot, derived from the server's availability answer. */
export type SlotTone = "available" | "booked" | "locked" | "past" | "beyond";

/**
 * Maps a slot's `isAvailable` + `reason` (as produced by useAvailability) to a
 * tone and a short human label. The `reason` strings ('Booked' | 'Locked' |
 * 'Too far' | 'Past') are the existing contract and are matched, not changed.
 */
export function slotTone(reason: string | null, isAvailable: boolean): SlotTone {
  if (isAvailable) return "available";
  switch (reason) {
    case "Past":
      return "past";
    case "Locked":
      return "locked";
    case "Too far":
      return "beyond";
    case "Booked":
    default:
      return "booked";
  }
}

/** Short label shown in the slot legend / on a disabled pill for each tone. */
export const SLOT_TONE_LABEL: Record<SlotTone, string> = {
  available: "Available",
  booked: "Booked",
  locked: "On hold",
  past: "Passed",
  beyond: "Too far",
};

export interface DialCode {
  /** Dial prefix incl. the leading '+'. */
  code: string;
  /** Country name for the option text. */
  name: string;
  /** Flag emoji for a compact selector. */
  flag: string;
}

/** Common country codes; India (+91) is the default. Order = selector order. */
export const DIAL_CODES: readonly DialCode[] = [
  { code: "+91", name: "India", flag: "🇮🇳" },
  { code: "+1", name: "United States / Canada", flag: "🇺🇸" },
  { code: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { code: "+971", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "+61", name: "Australia", flag: "🇦🇺" },
  { code: "+65", name: "Singapore", flag: "🇸🇬" },
  { code: "+64", name: "New Zealand", flag: "🇳🇿" },
  { code: "+49", name: "Germany", flag: "🇩🇪" },
] as const;

export const DEFAULT_DIAL_CODE = "+91";

/**
 * Combine a dial code and a national number into the single string stored in
 * the existing `phone` field (e.g. "+91 9876543210"). Returns "" when the
 * national part is empty, so an untouched field stays empty and the existing
 * required-phone rule fires rather than submitting a lone country code.
 */
export function composePhone(dialCode: string, national: string): string {
  const trimmed = national.trim();
  if (!trimmed) return "";
  return `${dialCode} ${trimmed}`;
}
