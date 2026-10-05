"use client";

import { useSyncExternalStore } from "react";
import {
  getConsentSnapshot,
  getServerConsentSnapshot,
  subscribeConsent,
  type AnalyticsConsentState,
} from "@/lib/analyticsConsent";

/** "unknown" until hydrated, then "unset" | "granted" | "denied". */
export function useAnalyticsConsent(): AnalyticsConsentState {
  return useSyncExternalStore(subscribeConsent, getConsentSnapshot, getServerConsentSnapshot);
}
