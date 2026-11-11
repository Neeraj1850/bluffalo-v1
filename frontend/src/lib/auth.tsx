"use client";

import { PrivyProvider, useLogout, usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSetup } from "@/lib/store/setup";
import { useTheme } from "@/lib/theme";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const CLIENT_ID = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || undefined;

/** True when NEXT_PUBLIC_PRIVY_APP_ID is set; without it sign-in is disabled (the app still renders). */
export const AUTH_CONFIGURED = APP_ID.length > 0;


/** Privy login (email first, wallet second), styled to the site's monochrome theme. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  // PrivyProvider throws on an empty app id: render the app signed-out instead.
  if (!AUTH_CONFIGURED) return <>{children}</>;
  return (
    <PrivyProvider
      appId={APP_ID}
      clientId={CLIENT_ID}
      config={{
        loginMethods: ["email", "wallet"],
        // Privy's own dark theme is navy; a hex background keeps it monochrome like the site.
        appearance: {
          theme: theme === "dark" ? "#0A0A0A" : "light",
          accentColor: theme === "dark" ? "#F2F2F2" : "#0A0A0A",
          showWalletLoginFirst: false,
          walletChainType: "ethereum-only",
          walletList: ["detected_wallets", "metamask", "coinbase_wallet", "rainbow", "wallet_connect"],
        },
        // NEAR accounts come later; no embedded EVM/Solana wallets for now.
        embeddedWallets: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

/** Privy state that is safe to read whether or not Privy is configured. */
function useAuthState() {
  // AUTH_CONFIGURED is a build-time constant, so the hook order never changes between renders.
  if (!AUTH_CONFIGURED) return { ready: true, authenticated: false, user: null, getAccessToken: async () => null };
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return usePrivy();
}

type LinkStatus = "idle" | "linking" | "linked" | "error";
type LinkState = { status: LinkStatus; error: string | null; retry: () => void; waitForLink: () => Promise<boolean> };

const LinkContext = createContext<LinkState>({
  status: "idle",
  error: null,
  retry: () => {},
  waitForLink: async () => false,
});

const ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One link attempt; throws on failure. 401s are retried too (a fresh token may fix them). */
async function linkOnce(getAccessToken: () => Promise<string | null>) {
  const token = await getAccessToken();
  if (!token) throw new Error("No access token from Privy");
  const res = await fetch("/api/auth/link", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Sign-in failed (${res.status})`);
  }
  return (await res.json()).state;
}

/**
 * Once Privy says the player is signed in, tie this browser to their server
 * session (verified server-side) with retry/backoff, and load their saved setup.
 * Exposes the link status through useSessionLink().
 */
export function SessionLink({ children }: { children?: React.ReactNode }) {
  const { ready, authenticated, user, getAccessToken } = useAuthState();
  const { adopt } = useSetup();
  const [status, setStatus] = useState<LinkStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const linkedFor = useRef<string | null>(null);
  const pending = useRef<Promise<boolean> | null>(null);
  const waiters = useRef<((ok: boolean) => void)[]>([]);
  const userId = user?.id ?? null;

  const settle = (ok: boolean) => {
    waiters.current.splice(0).forEach((w) => w(ok));
  };

  useEffect(() => {
    if (!ready) return;
    if (!authenticated || !userId) {
      linkedFor.current = null;
      setStatus("idle");
      setError(null);
      settle(false);
      return;
    }
    if (linkedFor.current === userId) return;
    let cancelled = false;
    setStatus("linking");
    setError(null);
    const run = (async () => {
      let last: unknown;
      for (let i = 0; i < ATTEMPTS && !cancelled; i++) {
        try {
          const state = await linkOnce(getAccessToken);
          if (cancelled) return false;
          adopt(state);
          linkedFor.current = userId;
          setStatus("linked");
          return true;
        } catch (e) {
          last = e;
          if (i < ATTEMPTS - 1) await sleep(500 * 2 ** i);
        }
      }
      if (!cancelled) {
        setStatus("error");
        setError(last instanceof Error ? last.message : "Couldn't finish signing in");
      }
      return false;
    })();
    pending.current = run;
    run.then((ok) => {
      if (!cancelled) settle(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, userId, getAccessToken, adopt, attempt]);

  const retry = useCallback(() => {
    linkedFor.current = null;
    setAttempt((n) => n + 1);
  }, []);

  const statusRef = useRef(status);
  statusRef.current = status;
  const waitForLink = useCallback(() => {
    if (statusRef.current === "linked") return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      waiters.current.push(resolve);
      // Safety net: never hang the Connect screen forever.
      setTimeout(() => resolve(statusRef.current === "linked"), 20_000);
    });
  }, []);

  const value = useMemo(() => ({ status, error, retry, waitForLink }), [status, error, retry, waitForLink]);
  return <LinkContext.Provider value={value}>{children}</LinkContext.Provider>;
}

/** Status of the server-session link (see SessionLink). */
export function useSessionLink() {
  return useContext(LinkContext);
}

/** Auth state for components that must work with or without Privy configured. */
export function useAuth() {
  const { ready, authenticated } = useAuthState();
  return { configured: AUTH_CONFIGURED, ready, authenticated };
}

/**
 * Send signed-out players to the Connect screen. Returns true only once Privy is
 * ready, the player is signed in and the server session is linked.
 */
export function useRequireSignIn() {
  const { ready, authenticated } = useAuthState();
  const { status } = useSessionLink();
  const router = useRouter();
  useEffect(() => {
    if (ready && !authenticated) router.replace("/");
  }, [ready, authenticated, router]);
  return ready && authenticated && (status === "linked" || status === "error");
}

/** Sign out of Privy and drop this browser's server session; the account keeps its data. */
export function useSignOut() {
  const { reset } = useSetup();
  const router = useRouter();
  const logoutPrivy = usePrivyLogout();
  return useCallback(async () => {
    // Server first so a Privy failure can't leave the browser tied to the account.
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    await logoutPrivy().catch(() => {});
    reset();
    router.replace("/");
  }, [logoutPrivy, reset, router]);
}

function usePrivyLogout(): () => Promise<void> {
  if (!AUTH_CONFIGURED) return async () => {};
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useLogout().logout;
}
