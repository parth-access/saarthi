"use client";

import { RouteError } from "@/components/ui/RouteFallback";

export default function TherapistError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      {...props}
      homeHref="/therapist"
      homeLabel="Back to workspace"
      showContact
      className="py-6"
    />
  );
}