"use client";

/**
 * Therapist dashboard — the landing page for /therapist.
 *
 * Renders the dashboard overview inside the shell layout. Data comes from
 * the layout context (useTherapistData), so navigating between tabs never
 * re-fetches.
 */
import { TherapistDashboardScreen } from "@/components/therapist/dashboard/TherapistDashboardScreen";
import { useTherapistData } from "./layout";

export default function TherapistDashboardRoute() {
  const data = useTherapistData();
  return <TherapistDashboardScreen data={data} />;
}
