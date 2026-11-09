"use client";

import { useLogin, usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { Arrow, Button, ButtonHint } from "@/components/ui/Button";

/**
 * Primary path is email — no crypto knowledge needed. The wallet option
 * is for people who already have one. Both open Privy.
 */
export function ConnectActions() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin({ onComplete: () => router.push("/lobby") });

  const go = (method: "email" | "wallet") => {
    if (authenticated) return router.push("/lobby");
    login({ loginMethods: [method] });
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
      <Button
        onClick={() => go("email")}
        disabled={!ready}
        trailing={<Arrow />}
        className="lg:h-[60px] lg:w-auto lg:min-w-[260px] lg:gap-6 lg:px-6 lg:text-[19px]"
      >
        {authenticated ? "Back to the tables" : "Continue with Email"}
      </Button>
      {!authenticated && (
        <Button
          variant="secondary"
          onClick={() => go("wallet")}
          disabled={!ready}
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
  );
}
