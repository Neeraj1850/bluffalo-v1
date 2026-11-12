import { NextResponse } from "next/server";
import { balanceOf, ChainError } from "@/lib/server/near";
import { resumeAll } from "@/lib/server/autoplay";
import { pendingHands } from "@/lib/server/deals";
import { inFlight } from "@/lib/server/inFlight";
import { sessionAgent, sessionFrom, withSession } from "@/lib/server/sessions";

/**
 * This player's agent account, its real balance in the contract (table NEAR), whether a hand
 * has it locked, and the hand committed on-chain still waiting for this browser's seed, if any.
 */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  void resumeAll(); // after a restart, the first request restarts server autoplay loops
  const account = await sessionAgent(session.id);
  if (!account) return reply({ account: null, balance: 0, inHand: false });
  try {
    const [balance, waiting] = await Promise.all([balanceOf(account), pendingHands.forAgent(account)]);
    return reply({
      account,
      balance,
      inHand: inFlight.has(account),
      ...(waiting && waiting.sessionId === session.id && !waiting.autoSeed ? { awaitingReveal: waiting.handId } : {}),
    });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}
