"use client";

import { useRouter } from "next/navigation";
import { Arrow, Button, ButtonHint } from "@/components/ui/Button";
import { useSetup } from "@/lib/store/setup";

/**
 * Primary path is email — no crypto knowledge needed. The wallet option
 * is for people who already have one. Both are mocked until Privy is wired.
 */
export function ConnectActions() {
  const router = useRouter();
  const { connect } = useSetup();

  const go = () => {
    connect();
    router.push("/lobby");
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
      <Button onClick={go} trailing={<Arrow />} className="lg:h-[60px] lg:w-auto lg:min-w-[260px] lg:gap-6 lg:px-6 lg:text-[19px]">
        Continue with Email
      </Button>
      <Button
        variant="secondary"
        onClick={go}
        trailing={
          <span className="lg:hidden">
            <ButtonHint muted>Have crypto?</ButtonHint>
          </span>
        }
        className="lg:h-[60px] lg:w-auto lg:justify-center lg:px-6 lg:text-[19px]"
      >
        Connect Wallet
      </Button>
    </div>
  );
}
