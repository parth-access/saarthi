"use client";

import { RouteError } from "@/components/ui/RouteFallback";

export default function AdminConsoleError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      {...props}
      homeHref="/admin"
      homeLabel="Back to overview"
      className="py-6"
    />
  );
}