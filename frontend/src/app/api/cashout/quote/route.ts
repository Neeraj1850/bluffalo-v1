import { NextResponse } from "next/server";
import { cashoutContext } from "@/lib/server/cashout";
import { balanceYocto, ChainError, fromYocto } from "@/lib/server/near";
import { withSession } from "@/lib/server/sessions";

const QUOTE_MS = 30_000;
/** Upper bound of the agent's gas for one withdraw (paid from its own account, not the balance). */
const FEE = 0.001;

/** What a cash-out would send, right now, from the agent's on-chain balance. Nothing moves. */
export async function POST(request: Request) {
  const ctx = await cashoutContext(request);
  if (ctx instanceof NextResponse) return ctx;
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), ctx.session);
  try {
    const yocto = await balanceYocto(ctx.agent);
    if (yocto === 0n) return reply({ error: "Your agent has nothing to cash out" }, 409);
    return reply({
      id: ctx.receiver,
      chain: "NEAR",
      send: fromYocto(yocto),
      fee: FEE,
      receive: Number(yocto) / 1e24,
      receiveAsset: "test NEAR",
      expiresAt: Date.now() + QUOTE_MS,
    });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}
