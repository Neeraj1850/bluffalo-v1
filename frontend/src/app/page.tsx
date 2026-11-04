import { ConnectActions } from "@/components/connect/ConnectActions";
import { HeroFan } from "@/components/connect/HeroFan";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Rise } from "@/components/ui/Rise";

const SUITS = "♠︎ ♡︎ ♣︎ ♢︎";

export default function ConnectPage() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="relative mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-5 pb-5 pt-6 lg:px-[clamp(16px,5vw,80px)] lg:py-8">
        <Rise
          distance={8}
          className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.24em] text-muted lg:text-[12px]"
        >
          <span>Near Poker Agent</span>
          <span aria-hidden="true" className="lg:hidden">
            {SUITS}
          </span>
          <span className="hidden lg:inline">Practice is free · no card needed</span>
        </Rise>

        <div className="flex flex-1 flex-col lg:grid lg:grid-cols-2 lg:items-center lg:gap-10 lg:py-10">
          {/* Copy + actions */}
          <div className="relative z-10 flex flex-1 flex-col lg:flex-none lg:gap-7">
            <Rise
              as="h1"
              feel="spring"
              delay={0.08}
              className="display mt-10 text-[84px] leading-[0.84] tracking-[-0.06em] lg:mt-0 lg:text-[clamp(80px,11vw,168px)] lg:leading-[0.82]"
            >
              play
              <br className="lg:hidden" /> the
              <br /> house.
            </Rise>
            <Rise
              as="p"
              delay={0.2}
              className="mt-5 max-w-[260px] text-[15px] leading-normal text-muted lg:mt-0 lg:max-w-[420px] lg:text-[18px]"
            >
              AI poker agent with real stakes. Provably fair. Cross-chain.
            </Rise>

            <Rise delay={0.64} className="relative mt-auto flex flex-col gap-3 pt-[280px] lg:mt-0 lg:pt-0">
              <ConnectActions />
              <p className="mt-1 text-[13px] leading-[1.45] text-muted lg:text-[14px]">
                New here? Email is all you need. We set up your account behind the scenes.
              </p>
            </Rise>
          </div>

          {/* Fan — absolutely placed on mobile, its own column on desktop */}
          <HeroFan
            variant="mobile"
            className="absolute right-[-54px] top-[336px] h-[300px] w-[300px] lg:hidden"
          />
          <HeroFan
            variant="desktop"
            className="relative hidden h-[clamp(360px,42vw,600px)] lg:block lg:-mr-[clamp(0px,6vw,120px)]"
          />
        </div>

        <span
          aria-hidden="true"
          className="absolute left-5 top-[560px] origin-top-left -rotate-90 font-mono text-[10px] uppercase tracking-[0.2em] text-muted lg:hidden"
        >
          Deal Nº 001
        </span>

        <footer className="mt-3 flex items-center justify-between gap-3 border-t border-hair pt-3 font-mono text-[10px] tracking-[0.14em] text-muted lg:text-[11px]">
          <span>powered by privy · settled on near</span>
          <ThemeToggle className="min-h-0 text-[10px]" />
        </footer>
      </div>
    </main>
  );
}
