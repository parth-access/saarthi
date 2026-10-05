"use client";

import { MotionConfig } from "framer-motion";

/**
 * Site-wide framer-motion configuration. `reducedMotion="user"` makes every
 * animation on the site respect the OS prefers-reduced-motion setting:
 * transform/layout animations are skipped (opacity still fades), so content
 * always appears without movement for users who opt out of motion.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
