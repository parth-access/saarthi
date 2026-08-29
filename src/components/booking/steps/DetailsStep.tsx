import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { bookingFormSchema, BookingFormData as FormData } from "../../../core/validations/booking.schema"
import { ChevronLeft, ChevronRight, ChevronDown, Lock, Sparkles } from "lucide-react"
import NextLink from "next/link"
import { Button } from "../../ui/Button"
import { Input } from "../../ui/Input"
import { Textarea } from "../../ui/Textarea"

const formSchema = bookingFormSchema;

interface Props {
  initialData: Partial<FormData>;
  sessionType?: string;
  onNext: (data: FormData) => void;
  onBack: () => void;
}

export const DetailsStep = ({ initialData, sessionType = "Individual", onNext, onBack }: Props) => {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData.name || "",
      email: initialData.email || "",
      phone: initialData.phone || "",
      gender: initialData.gender || "",
      age: initialData.age || "",
      message: initialData.message || "",
      consent: initialData.consent ?? true
    }
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="text-center space-y-2">
        <h3 className="text-3xl font-serif text-primary">Your Details</h3>
        <p className="text-muted-foreground text-sm">Please provide your intake details for your confidential session.</p>
        
        {/* Subtle Price & Session Anchor */}
        <div className="pt-1 flex items-center justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-xs font-medium text-primary">
            <Sparkles className="w-3.5 h-3.5 text-[#E6A520]" />
            <span>{sessionType} Therapy Session</span>
            <span className="text-primary/30">·</span>
            <span className="font-bold">₹1,500</span>
            <span className="text-primary/30">·</span>
            <span className="text-muted-foreground">50 Minutes</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onNext)} className="space-y-6 max-w-xl mx-auto">
        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-2">
            <label htmlFor="booking-name" className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">
              Full Name
            </label>
            <Input 
              id="booking-name"
              {...register("name")} 
              placeholder="E.g. Siddharth Singh" 
              autoComplete="name"
              className="h-14 rounded-2xl bg-primary/5 border border-transparent focus:border-primary/20 focus:ring-2 focus:ring-primary/10" 
            />
            {errors.name && <p className="text-xs text-red-500 ml-1">{errors.name.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="booking-email" className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">
              Email Address
            </label>
            <Input 
              id="booking-email"
              {...register("email")} 
              type="email" 
              autoComplete="email"
              placeholder="E.g. sidd@email.com" 
              className="h-14 rounded-2xl bg-primary/5 border border-transparent focus:border-primary/20 focus:ring-2 focus:ring-primary/10" 
            />
            {errors.email && <p className="text-xs text-red-500 ml-1">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <label htmlFor="booking-phone" className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">
              Phone Number
            </label>
            <Input 
              id="booking-phone"
              {...register("phone")} 
              type="tel" 
              autoComplete="tel" 
              placeholder="+91 98765 43210" 
              className="h-14 rounded-2xl bg-primary/5 border border-transparent focus:border-primary/20 focus:ring-2 focus:ring-primary/10" 
            />
            {errors.phone && <p className="text-xs text-red-500 ml-1">{errors.phone.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="booking-gender" className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">
              Gender
            </label>
            <div className="relative">
              <select 
                id="booking-gender"
                {...register("gender")}
                className="flex h-14 w-full rounded-2xl bg-primary/5 border border-transparent px-4 text-sm appearance-none outline-none focus:border-primary/20 focus:ring-2 focus:ring-primary/10 text-primary font-medium transition-all"
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other / Non-binary</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
              <ChevronDown className="w-4 h-4 text-primary/40 pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" />
            </div>
            {errors.gender && <p className="text-xs text-red-500 ml-1">{errors.gender.message}</p>}
          </div>
          <div className="space-y-2">
            <label htmlFor="booking-age" className="text-[10px] uppercase font-black tracking-widest text-primary/60 ml-1">
              Age
            </label>
            <Input 
              id="booking-age"
              {...register("age")} 
              type="number" 
              min={1}
              max={120}
              inputMode="numeric"
              placeholder="E.g. 26" 
              className="h-14 rounded-2xl bg-primary/5 border border-transparent focus:border-primary/20 focus:ring-2 focus:ring-primary/10" 
            />
            {errors.age && <p className="text-xs text-red-500 ml-1">{errors.age.message}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between ml-1">
            <label htmlFor="booking-message" className="text-[10px] uppercase font-black tracking-widest text-primary/60">
              Note for Therapist (Optional)
            </label>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
              <Lock className="w-3 h-3 text-primary/60" /> Confidential
            </span>
          </div>
          <Textarea 
            id="booking-message"
            {...register("message")} 
            placeholder="Briefly describe what brings you to therapy or what you would like support with..." 
            rows={4} 
            className="rounded-[2rem] bg-primary/5 border border-transparent p-5 focus:border-primary/20 focus:ring-2 focus:ring-primary/10 text-sm" 
          />
          <p className="text-[11px] text-muted-foreground ml-1">
            Only your assigned licensed therapist will see your note.
          </p>
        </div>

        {/* DPDP Act Compliant Consent Checkbox */}
        <div className="space-y-2 pt-2 border-t border-primary/5">
          <label 
            htmlFor="booking-consent" 
            className="flex items-start gap-3 p-3 rounded-xl hover:bg-primary/5 transition-colors cursor-pointer text-xs text-muted-foreground leading-relaxed"
          >
            <input 
              id="booking-consent"
              type="checkbox" 
              {...register("consent")} 
              className="mt-0.5 h-4 w-4 rounded text-primary focus:ring-primary/20 border-primary/30 shrink-0 accent-[#1F5E3B]" 
            />
            <span>
              I agree to the{" "}
              <NextLink href="/privacy" target="_blank" className="font-semibold text-primary underline underline-offset-2 hover:text-[#E6A520]">
                Privacy Policy
              </NextLink>{" "}
              and{" "}
              <NextLink href="/terms" target="_blank" className="font-semibold text-primary underline underline-offset-2 hover:text-[#E6A520]">
                Terms of Service
              </NextLink>
              , and consent to Saarthi processing my personal contact and intake information for confidential mental health therapy.
            </span>
          </label>
          {errors.consent && (
            <p className="text-xs text-red-500 font-medium ml-2">{errors.consent.message}</p>
          )}
        </div>

        <div className="flex justify-between pt-4">
          <Button type="button" variant="ghost" className="rounded-full hover:bg-primary/5" onClick={onBack}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button type="submit" className="rounded-full px-10 bg-[#E6A520] hover:bg-[#d49419] text-white border-none shadow-md shadow-[#E6A520]/20 font-bold">
            Review Request <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};
