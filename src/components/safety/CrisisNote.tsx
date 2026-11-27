import { cn } from "@/lib/utils";

/**
 * The "not an emergency service" line with India's crisis numbers. One copy of
 * the wording so the footer, booking and dashboard never drift apart.
 */
export function CrisisNote({ className }: { className?: string }) {
  const link = "font-semibold text-primary underline-offset-2 hover:underline";
  return (
    <p className={cn("rounded-2xl bg-primary/5 px-5 py-4 text-sm leading-relaxed text-muted-foreground", className)}>
      <span className="font-semibold text-primary">Saarthi is not an emergency service.</span>{" "}
      If you are in crisis or thinking about harming yourself, call the government&apos;s free Tele-MANAS helpline on{" "}
      <a href="tel:14416" className={link}>14416</a> or{" "}
      <a href="tel:18008914416" className={link}>1-800-891-4416</a>,
      or <a href="tel:112" className={link}>112</a> in an emergency.
    </p>
  );
}
