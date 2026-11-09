"use client";

import { PrivyProvider, useLogout, usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useSetup } from "@/lib/store/setup";
import { useTheme } from "@/lib/theme";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

/** Privy login (email first, wallet second), styled to the site's monochrome theme. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["email", "wallet"],
        // Privy's own dark theme is navy; a hex background keeps it monochrome like the site.
        appearance: {
          theme: theme === "dark" ? "#0A0A0A" : "light",
          accentColor: theme === "dark" ? "#F2F2F2" : "#0A0A0A",
          showWalletLoginFirst: false,
        },
        // NEAR accounts come later; no embedded EVM/Solana wallets for now.
        embeddedWallets: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

/**
 * Once Privy says the player is signed in, tie this browser to their server
 * session (verified server-side) and load their saved setup. Renders nothing.
 */
export function SessionLink() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { adopt } = useSetup();
  const linked = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated || !user || linked.current === user.id) return;
    linked.current = user.id;
    (async () => {
      const token = await getAccessToken();
      const res = await fetch("/api/auth/link", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) adopt((await res.json()).state);
      else linked.current = null;
    })().catch(() => {
      linked.current = null;
    });
  }, [ready, authenticated, user, getAccessToken, adopt]);

  return null;
}

/** Send signed-out players to the Connect screen. */
export function useRequireSignIn() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  useEffect(() => {
    if (ready && !authenticated) router.replace("/");
  }, [ready, authenticated, router]);
  return ready && authenticated;
}

/** Sign out of Privy and drop this browser's session; the account keeps its data. */
export function useSignOut() {
  const { reset } = useSetup();
  const router = useRouter();
  const { logout } = useLogout({
    onSuccess: async () => {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      reset();
      router.replace("/");
    },
  });
  return logout;
}
