"use client";

import { useLogin } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Arrow, Button, ButtonHint } from "@/components/ui/Button";
import { AUTH_CONFIGURED, useAuth, useSessionLink } from "@/lib/auth";

type Method = "email" | "wallet";

/**
 * Primary path is email — no crypto knowledge needed. The wallet option
 * is for people who already have one. Both open Privy.
 */
export function ConnectActions() {
  return AUTH_CONFIGURED ? <PrivyConnectActions /> : <ActionButtons disabled onPick={() => {}} notice={NOT_CONFIGURED} />;
}

const NOT_CONFIGURED = "Sign-in isn't configured (NEXT_PUBLIC_PRIVY_APP_ID).";

function PrivyConnectActions() {
  const router = useRouter();
  const { ready, authenticated } = useAuth();
  const { status, error, retry, waitForLink } = useSessionLink();
  const [entering, setEntering] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Only enter the lobby once the server session is tied to this account.
  const enter = async () => {
    setEntering(true);
    const ok = await waitForLink();
    setEntering(false);
    if (ok) router.push("/practice");
  };

  const { login } = useLogin({
    onComplete: () => {
      setLoginError(null);
      void enter();
    },
    onError: (code) => {
      // Closing the modal isn't an error worth showing.
      if (code !== "exited_auth_flow") setLoginError("Sign-in didn't complete. Please try again.");
    },
  });

  const pick = (method: Method) => {
    if (authenticated) return void enter();
    setLoginError(null);
    login({ loginMethods: [method] });
  };

  const busy = entering || (authenticated && status === "linking");
  const linkFailed = authenticated && status === "error";
  return (
    <>
      <ActionButtons
        disabled={!ready || busy}
        authenticated={authenticated}
        busy={busy}
        onPick={pick}
        notice={linkFailed ? `Couldn't finish signing in: ${error ?? "unknown error"}` : loginError}
      />
      {linkFailed && (
        <button
          type="button"
          onClick={retry}
          className="self-start font-mono text-[11px] uppercase tracking-[0.1em] text-muted underline hover:text-fg"
        >
          Try again
        </button>
      )}
    </>
  );
}

function ActionButtons({
  disabled,
  authenticated = false,
  busy = false,
  onPick,
  notice,
}: {
  disabled: boolean;
  authenticated?: boolean;
  busy?: boolean;
  onPick: (m: Method) => void;
  notice?: string | null;
}) {
  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
        <Button
          onClick={() => onPick("email")}
          disabled={disabled}
          trailing={<Arrow />}
          className="lg:h-[60px] lg:w-auto lg:min-w-[260px] lg:gap-6 lg:px-6 lg:text-[19px]"
        >
          {busy ? "Signing you in…" : authenticated ? "Back to the tables" : "Continue with Email"}
        </Button>
        {!authenticated && (
          <Button
            variant="secondary"
            onClick={() => onPick("wallet")}
            disabled={disabled}
            trailing={
              <span className="lg:hidden">
                <ButtonHint muted>Have crypto?</ButtonHint>
              </span>
            }
            className="lg:h-[60px] lg:w-auto lg:justify-center lg:px-6 lg:text-[19px]"
          >
            Connect Wallet
          </Button>
        )}
      </div>
      {notice && (
        <p role="alert" className="text-[13px] leading-[1.45] text-fg lg:text-[14px]">
          {notice}
        </p>
      )}
    </>
  );
}
