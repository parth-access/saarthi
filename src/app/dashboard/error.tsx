"use client";

import { RouteError } from "@/components/ui/RouteFallback";

export default function DashboardError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      {...props}
      homeHref="/dashboard"
      homeLabel="Back to dashboard"
      showContact
      className="px-4 pb-24 pt-28 sm:px-6"
    />
  );
}