"use client";

/**
 * Availability page — wraps the existing ScheduleBuilder.
 *
 * No new functionality; just a proper route inside the therapist shell so
 * the sidebar stays persistent when the therapist navigates here.
 */
import { ScheduleBuilder } from '@/components/dashboard/ScheduleBuilder';
import { useTherapistData } from '../layout';

export default function TherapistAvailabilityPage() {
  const data = useTherapistData();
  const therapistId = data.therapist?.id || '';

  if (!therapistId) {
    return (
      <div className="rounded-xl border border-dashed border-hairline bg-white px-5 py-8 text-center shadow-sm">
        <p className="text-sm font-medium text-primary">Availability not ready</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          A therapist profile is needed before working hours can be loaded.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="border-b border-hairline pb-2.5">
        <h2 className="font-serif text-base font-semibold text-primary">Working Hours</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Set your recurring hours and closed dates. These are the times clients can request.
        </p>
      </div>
      <ScheduleBuilder therapistId={therapistId} />
    </section>
  );
}
