"use client";

import { MotionConfig } from "framer-motion";
import { SetupProvider } from "@/lib/store/setup";

/** App-wide client providers. reducedMotion="user" honours the OS setting. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <SetupProvider>{children}</SetupProvider>
    </MotionConfig>
  );
}
