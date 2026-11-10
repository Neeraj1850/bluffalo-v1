import { NextResponse } from "next/server";
import { cashoutContext } from "@/lib/server/cashout";
import { balanceYocto, ChainError, withdrawTo } from "@/lib/server/near";
import { withSession } from "@/lib/server/sessions";

/**
 * Send the agent's whole on-chain balance to the player's testnet account.
 * The amount is read from the contract here — never taken from the browser —
 * and the agent signs with its own withdraw-only key.
 */
export async function POST(request: Request) {
  const ctx = await cashoutContext(request);
  if (ctx instanceof NextResponse) return ctx;
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), ctx.session);
  try {
    const yocto = await balanceYocto(ctx.agent);
    if (yocto === 0n) return reply({ error: "Your agent has nothing to cash out" }, 409);
    const id = await withdrawTo(ctx.agent, ctx.agentKey, ctx.receiver, yocto);
    return reply({ id });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}
