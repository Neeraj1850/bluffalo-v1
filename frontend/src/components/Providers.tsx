"use client";

import { MotionConfig } from "framer-motion";
import { AuthProvider, SessionLink } from "@/lib/auth";
import { SetupProvider } from "@/lib/store/setup";

/** App-wide client providers. reducedMotion="user" honours the OS setting. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <SetupProvider>
          <SessionLink />
          {children}
        </SetupProvider>
      </AuthProvider>
    </MotionConfig>
  );
}
