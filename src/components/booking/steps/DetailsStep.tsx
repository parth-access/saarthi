"use client";

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { motion, useReducedMotion } from "framer-motion"
import { bookingFormSchema, BookingFormData as FormData } from "../../../core/validations/booking.schema"
import { MAX_CLIENT_AGE, MIN_CLIENT_AGE, SESSION_DURATION_MINUTES } from "@/shared/constants"
import { ChevronLeft, ChevronRight, ChevronDown, Lock, Sparkles, CheckCircle2 } from "lucide-react"
import NextLink from "next/link"
import { Button } from "../../ui/Button"
import { Input } from "../../ui/Input"
import { Textarea } from "../../ui/Textarea"
import { cn } from "../../../lib/utils"
import { DIAL_CODES, DEFAULT_DIAL_CODE, composePhone, SESSION_PRICE_DISPLAY } from "../bookingUi"

const formSchema = bookingFormSchema;

interface Props {
  initialData: Partial<FormData>;
  sessionType?: string;
  onNext: (data: FormData) => void;
  onBack: () => void;
}

/** Longest dial code is 4 chars ("+971"); keeps the composed value within the schema's 20-char max. */
const MAX_NATIONAL_LEN = 15;

/** Split a stored composed phone (e.g. "+91 98765 43210") back into selector + national parts. */
function splitPhone(full?: string): { dialCode: string; national: string } {
  const v = (full || "").trim();
  if (!v) return { dialCode: DEFAULT_DIAL_CODE, national: "" };
  const match = DIAL_CODES.find((d) => v.startsWith(d.code));
  if (match) return { dialCode: match.code, national: v.slice(match.code.length).trim() };
  return { dialCode: DEFAULT_DIAL_CODE, national: v.replace(/^\+/, "").trim() };
}

/** Decorative required marker; aria-required on the control carries the real semantics. */
function Required() {
  return <span className="text-danger" aria-hidden> *</span>;
}

/**
 * Spring-in green check shown at a valid field's trailing edge. The span stays
 * mounted and animates toward a `show`-driven target rather than mounting/exiting
 * via AnimatePresence: DetailsStep re-renders on every keystroke (`watch()`), which
 * can interrupt a presence-exit and leave a stale tick visible on a now-invalid
 * field. An idempotent animate target always settles at opacity 0 when hidden.
 * Respects reduced motion.
 */
function FieldTick({ show, className }: { show: boolean; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      initial={false}
      animate={show ? { opacity: 1, scale: 1 } : { opacity: 0, scale: reduce ? 1 : 0.4 }}
      transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 500, damping: 22 }}
      className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-success", className ?? "right-3")}
      aria-hidden
    >
      <CheckCircle2 className="h-5 w-5" />
    </motion.span>
  );
}

export const DetailsStep = ({ initialData, sessionType = "Individual", onNext, onBack }: Props) => {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      name: initialData.name || "",
      email: initialData.email || "",
      phone: initialData.phone || "",
      gender: initialData.gender || "",
      age: initialData.age || "",
      message: initialData.message || "",
      consent: initialData.consent ?? true,
    },
  });

  // The country-code selector + national input compose into the single `phone`
  // wire field; the RHF value and validation contract are unchanged.
  const initialPhone = React.useMemo(() => splitPhone(initialData.phone), [initialData.phone]);
  const [dialCode, setDialCode] = React.useState(initialPhone.dialCode);
  const [national, setNational] = React.useState(initialPhone.national);
  const syncPhone = (nextDial: string, nextNational: string) => {
    setValue("phone", composePhone(nextDial, nextNational), { shouldValidate: true, shouldDirty: true });
  };

  // A field earns its green tick once it holds a value and has no outstanding error.
  const values = watch();
  const isValid = (field: keyof FormData) => !errors[field] && String(values[field] ?? "").trim().length > 0;

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <h3 className="font-serif text-3xl text-primary">Your Details</h3>
        <p className="text-sm text-muted-foreground">Please provide your intake details for your confidential session.</p>

        {/* Subtle price & session anchor — keeps the amount visible before Review. */}
        <div className="flex items-center justify-center pt-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span>{sessionType} Therapy Session</span>
            <span className="text-primary/30">·</span>
            <span className="font-bold">{SESSION_PRICE_DISPLAY}</span>
            <span className="text-primary/30">·</span>
            <span className="text-muted-foreground">{SESSION_DURATION_MINUTES} Minutes</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onNext)} className="mx-auto max-w-xl space-y-6" noValidate>
        {/* Full name */}
        <div className="space-y-2">
          <label htmlFor="booking-name" className="ml-1 block text-[10px] font-black uppercase tracking-widest text-primary/60">
            Full Name<Required />
          </label>
          <div className="relative">
            <Input
              id="booking-name"
              {...register("name")}
              placeholder="E.g. Siddharth Singh"
              autoComplete="name"
              aria-required
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "booking-name-error" : undefined}
              className="h-14 rounded-2xl border border-transparent bg-primary/5 pr-11 focus:border-primary/20 focus:ring-2 focus:ring-primary/10"
            />
            <FieldTick show={isValid("name")} />
          </div>
          {errors.name && <p id="booking-name-error" className="ml-1 text-xs text-danger">{errors.name.message}</p>}
        </div>

        {/* Email + phone */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="booking-email" className="ml-1 block text-[10px] font-black uppercase tracking-widest text-primary/60">
              Email Address<Required />
            </label>
            <div className="relative">
              <Input
                id="booking-email"
                {...register("email")}
                type="email"
                autoComplete="email"
                placeholder="E.g. sidd@email.com"
                aria-required
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "booking-email-error" : undefined}
                className="h-14 rounded-2xl border border-transparent bg-primary/5 pr-11 focus:border-primary/20 focus:ring-2 focus:ring-primary/10"
              />
              <FieldTick show={isValid("email")} />
            </div>
            {errors.email && <p id="booking-email-error" className="ml-1 text-xs text-danger">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="booking-phone" className="ml-1 block text-[10px] font-black uppercase tracking-widest text-primary/60">
              Phone Number<Required />
            </label>
            <div className="flex items-stretch gap-2">
              <div className="relative shrink-0">
                <select
                  aria-label="Country dial code"
                  value={dialCode}
                  onChange={(e) => { setDialCode(e.target.value); syncPhone(e.target.value, national); }}
                  className="h-14 w-[104px] appearance-none rounded-2xl border border-transparent bg-primary/5 pl-4 pr-8 text-sm font-semibold text-primary outline-none transition-all focus:border-primary/20 focus:ring-2 focus:ring-primary/10"
                >
                  {DIAL_CODES.map((d) => (
                    <option key={d.code} value={d.code}>{d.flag} {d.code}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/40" />
              </div>
              <div className="relative flex-1">
                <Input
                  id="booking-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  maxLength={MAX_NATIONAL_LEN}
                  value={national}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^\d\s()\-]/g, "").slice(0, MAX_NATIONAL_LEN);
                    setNational(cleaned);
                    syncPhone(dialCode, cleaned);
                  }}
                  aria-required
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? "booking-phone-error" : undefined}
                  className="h-14 rounded-2xl border border-transparent bg-primary/5 pr-11 focus:border-primary/20 focus:ring-2 focus:ring-primary/10"
                />
                <FieldTick show={isValid("phone")} />
              </div>
            </div>
            {errors.phone && <p id="booking-phone-error" className="ml-1 text-xs text-danger">{errors.phone.message}</p>}
          </div>
        </div>

        {/* Gender + age */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="booking-gender" className="ml-1 block text-[10px] font-black uppercase tracking-widest text-primary/60">
              Gender<Required />
            </label>
            <div className="relative">
              <select
                id="booking-gender"
                {...register("gender")}
                aria-required
                aria-invalid={!!errors.gender}
                aria-describedby={errors.gender ? "booking-gender-error" : undefined}
                className="flex h-14 w-full appearance-none rounded-2xl border border-transparent bg-primary/5 px-4 pr-16 text-sm font-medium text-primary outline-none transition-all focus:border-primary/20 focus:ring-2 focus:ring-primary/10"
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other / Non-binary</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
              <FieldTick show={isValid("gender")} className="right-10" />
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/40" />
            </div>
            {errors.gender && <p id="booking-gender-error" className="ml-1 text-xs text-danger">{errors.gender.message}</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="booking-age" className="ml-1 block text-[10px] font-black uppercase tracking-widest text-primary/60">
              Age<Required />
            </label>
            <div className="relative">
              <Input
                id="booking-age"
                {...register("age")}
                type="number"
                min={MIN_CLIENT_AGE}
                max={MAX_CLIENT_AGE}
                step={1}
                inputMode="numeric"
                placeholder="E.g. 26"
                aria-required
                aria-invalid={!!errors.age}
                aria-describedby={errors.age ? "booking-age-error" : undefined}
                className="h-14 rounded-2xl border border-transparent bg-primary/5 pr-11 focus:border-primary/20 focus:ring-2 focus:ring-primary/10"
              />
              <FieldTick show={isValid("age")} />
            </div>
            {errors.age && <p id="booking-age-error" className="ml-1 text-xs text-danger">{errors.age.message}</p>}
          </div>
        </div>

        {/* Note for therapist — the only optional field */}
        <div className="space-y-2">
          <div className="ml-1 flex items-center justify-between">
            <label htmlFor="booking-message" className="text-[10px] font-black uppercase tracking-widest text-primary/60">
              Note for Therapist (Optional)
            </label>
            <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Lock className="h-3 w-3 text-primary/60" /> Confidential
            </span>
          </div>
          <Textarea
            id="booking-message"
            {...register("message")}
            placeholder="Briefly describe what brings you to therapy or what you would like support with..."
            rows={4}
            className="rounded-[2rem] border border-transparent bg-primary/5 p-5 text-sm focus:border-primary/20 focus:ring-2 focus:ring-primary/10"
          />
          <p className="ml-1 text-[11px] text-muted-foreground">Only your assigned licensed therapist will see your note.</p>
        </div>

        {/* DPDP Act compliant consent — pre-checked, must be true (unchanged) */}
        <div className="space-y-2 border-t border-primary/5 pt-2">
          <label
            htmlFor="booking-consent"
            className="flex cursor-pointer items-start gap-3 rounded-xl p-3 text-xs leading-relaxed text-muted-foreground transition-colors hover:bg-primary/5"
          >
            <input
              id="booking-consent"
              type="checkbox"
              {...register("consent")}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-primary/30 text-primary accent-primary focus:ring-primary/20"
            />
            <span>
              I agree to the{" "}
              <NextLink href="/privacy" target="_blank" className="font-semibold text-primary underline underline-offset-2 hover:text-accent">
                Privacy Policy
              </NextLink>{" "}
              and{" "}
              <NextLink href="/terms" target="_blank" className="font-semibold text-primary underline underline-offset-2 hover:text-accent">
                Terms of Service
              </NextLink>
              , and consent to Saarthi processing my personal contact and intake information for confidential mental health therapy.
            </span>
          </label>
          {errors.consent && <p className="ml-2 text-xs font-medium text-danger">{errors.consent.message}</p>}
        </div>

        <div className="flex justify-between pt-4">
          <Button type="button" variant="ghost" className="rounded-full hover:bg-primary/5" onClick={onBack}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button type="submit" variant="accent" className="rounded-full px-10 font-bold shadow-md shadow-accent/20">
            Review Request <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};