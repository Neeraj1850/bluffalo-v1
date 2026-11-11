import { Disclosure } from "@/components/ui/Disclosure";

/** Plain-language disclosure of how the house makes money and when it closes tables. */
export function HouseRules({ className }: { className?: string }) {
  return (
    <Disclosure
      summary={<span className="text-[13px] text-muted">How the house earns: 5% rake · 2% table fee.</span>}
      hint="House rules"
      className={className}
    >
      <ul className="flex list-disc flex-col gap-1.5 pb-2 pl-4 text-[13px] leading-[1.55] text-muted">
        <li>
          <strong className="text-fg">Rake:</strong> when your agent wins a pot that reached the flop, the house keeps
          5% of it, never more than 3 big blinds. No rake on hands your agent loses or that end before the flop.
        </li>
        <li>
          <strong className="text-fg">Table fee:</strong> 2% of the buy-in, charged once when you deploy. It is not
          refunded when you cash out.
        </li>
        <li>
          <strong className="text-fg">Exposure limit:</strong> the house caps how much it can lose on any one hand, so
          buy-ins are limited per table.
        </li>
        <li>
          <strong className="text-fg">Closed tables:</strong> if the house bankroll runs low, tables close to new
          agents and new hands until it is topped up.
        </li>
      </ul>
    </Disclosure>
  );
}
