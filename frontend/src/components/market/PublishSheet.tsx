"use client";

import { useRef, useState } from "react";
import { Button, ButtonHint, ButtonLink } from "@/components/ui/Button";
import { ConfirmationSummary } from "@/components/ui/ConfirmationSummary";
import { Sheet } from "@/components/ui/Sheet";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getPreset, strategyLine } from "@/lib/data/strategy";
import { BASE_PRICE } from "@/lib/market/rules";
import { useSetup } from "@/lib/store/setup";
import { ApiError, publishStrategy, txUrl } from "@/services/agentApi";
import { Segmented } from "./Segmented";

type Phase =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "done"; tokenId: string; tx: string }
  | { status: "failed"; message: string; fundsMoved: boolean };

const SEATS = [10, 25, 100] as const;
type Seats = (typeof SEATS)[number];

/** Publish the current sliders as a sealed strategy: seats are minted and listed at your ask. */
export function PublishSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { preset, params } = useSetup();
  const [name, setName] = useState(() => (preset === "custom" ? "" : getPreset(preset).label));
  const [seats, setSeats] = useState<Seats>(10);
  const [priceText, setPriceText] = useState(String(BASE_PRICE));
  const [phase, setPhase] = useState<Phase>({ status: "idle" });
  const inFlight = useRef(false);

  const price = Number(priceText);
  const valid = name.trim().length >= 1 && name.trim().length <= 48 && price >= 1 && price <= 500;

  const publish = async () => {
    if (!valid || inFlight.current) return;
    inFlight.current = true;
    setPhase({ status: "pending" });
    try {
      const r = await publishStrategy({ name: name.trim(), params, seats, price });
      setPhase({ status: "done", ...r });
    } catch (err) {
      setPhase({
        status: "failed",
        message: err instanceof Error ? err.message : "Something went wrong.",
        fundsMoved: err instanceof ApiError ? err.fundsMoved : false,
      });
    } finally {
      inFlight.current = false;
    }
  };

  const pending = phase.status === "pending";
  const field = "h-12 rounded-btn border border-border bg-transparent px-4 font-mono text-[15px] outline-none focus:border-fg";
  const label = "font-mono text-[11px] uppercase tracking-[0.12em] text-muted";

  return (
    <Sheet open={open} onClose={onClose} title="publish to the market">
      <div className="flex flex-col gap-4">
        <StatusBadge kind={phase.status === "done" ? "confirmed" : pending ? "submitted" : phase.status === "failed" ? "failed" : "quote"} />
        <label className="flex flex-col gap-1.5">
          <span className={label}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={48} disabled={pending} placeholder="Night Shark" className={field} />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className={label}>Seats</span>
          <Segmented id="publish-seats" role="radio" label="Seats" value={seats} onChange={setSeats} options={SEATS.map((n) => ({ key: n, label: String(n) }))} />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Ask per seat · GNEAR</span>
          <input value={priceText} onChange={(e) => setPriceText(e.target.value)} inputMode="decimal" disabled={pending} className={field} />
        </label>
        <ConfirmationSummary
          rows={[
            { label: "Settings", value: "Sealed", note: strategyLine(params) },
            { label: "Seats", value: String(seats), note: "each license plays one agent" },
            { label: "Ask", value: `${Number.isFinite(price) ? price.toFixed(1) : "—"} GNEAR`, note: "you keep 100% of first sales" },
            { label: "Resales", value: "10% to you", note: "royalty on every resale" },
            { label: "Cost", value: "Free", note: "we pay the mint" },
          ]}
        />
        {phase.status === "failed" && (
          <p role="alert" className="text-[14px] leading-normal text-muted">
            {phase.message} {phase.fundsMoved ? "Some funds may have moved — check your balance." : "No funds moved."}
          </p>
        )}
        {phase.status === "done" ? (
          <div role="status" className="flex flex-col gap-3">
            <p className="text-[14px]">
              Listed.{" "}
              <a href={txUrl(phase.tx)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                See the mint ↗
              </a>
            </p>
            <ButtonLink href="/market/sim" trailing={<ButtonHint>→</ButtonHint>}>
              Watch the market react
            </ButtonLink>
          </div>
        ) : (
          <Button onClick={publish} disabled={!valid} pending={pending} pendingLabel="Publishing…">
            Publish
          </Button>
        )}
      </div>
    </Sheet>
  );
}
