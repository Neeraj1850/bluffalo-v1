import { PlayingCard } from "@/components/cards/PlayingCard";
import { Arrow, ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-8 px-5 py-10">
      <div className="flex">
        <PlayingCard face="down" size="lg" tilt={-12} decorative />
        <PlayingCard face="empty" size="lg" tilt={8} className="-ml-8" />
      </div>
      <div className="flex flex-col gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted">404 · Misdeal</span>
        <h1 className="display text-[72px] leading-[0.85] tracking-[-0.06em]">
          no card
          <br />
          here.
        </h1>
        <p className="max-w-sm text-[15px] leading-normal text-muted">
          This page doesn&rsquo;t exist. Your balance and settings are untouched.
        </p>
      </div>
      <ButtonLink href="/lobby" trailing={<Arrow />}>
        Back to the tables
      </ButtonLink>
    </main>
  );
}
