import { NextResponse } from "next/server";
import { verifyDeal } from "@/lib/poker/fairness";
import { strategyHands, strategyOf, TOKEN_ID } from "@/lib/server/market";
import { ChainError, getHand } from "@/lib/server/near";

const MAX_CHECKED = 50;

/**
 * Re-check a strategy's record against the chain: each hand settled on-chain
 * with the revealed seed, re-deals to the recorded cards, and was played by an
 * agent the market contract binds to this strategy.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!TOKEN_ID.test(id)) return NextResponse.json({ error: "Unknown strategy" }, { status: 404 });
  try {
    const hands = (await strategyHands(id)).slice(0, MAX_CHECKED);
    const bound = new Map<string, Promise<string | null>>();
    const mismatches: string[] = [];
    await Promise.all(
      hands.map(async (h) => {
        const why = await (async () => {
          if (!h.chain) return "no on-chain record";
          const onChain = await getHand(h.id.replace(/^#/, ""), h.chain.contract);
          if (!onChain || onChain.status !== "Settled") return "not settled on-chain";
          if (onChain.server_seed !== h.proof.seed || onChain.player !== h.chain.agent) return "seed or player differs on-chain";
          const deal = await verifyDeal(h.proof);
          if (!deal.ok) return deal.reason;
          if (!bound.has(h.chain.agent)) bound.set(h.chain.agent, strategyOf(h.chain.agent));
          if ((await bound.get(h.chain.agent)) !== id) return "agent not licensed to this strategy";
          return null;
        })();
        if (why) mismatches.push(`${h.id}: ${why}`);
      }),
    );
    return NextResponse.json({ verified: hands.length - mismatches.length, total: hands.length, mismatches });
  } catch (e) {
    if (e instanceof ChainError) return NextResponse.json({ error: e.message, code: "chain_down" }, { status: 503 });
    throw e;
  }
}
