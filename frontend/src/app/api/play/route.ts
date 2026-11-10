import { NextResponse } from "next/server";
import { getTable } from "@/lib/data/tables";
import { takeSeed } from "@/lib/server/deals";
import { ServiceDownError } from "@/lib/server/decide";
import { recordHand } from "@/lib/server/hands";
import { balanceOf, ChainError, commitHand, settleHand } from "@/lib/server/near";
import { parsePlayRequest, playHand } from "@/lib/server/play";
import { sessionAgent, sessionFrom, sessionUser, withSession } from "@/lib/server/sessions";

/**
 * Play a hand committed with POST /api/deal. The response reveals the seed.
 * Real-money hands are committed on NEAR testnet before the deal (stacks
 * locked, seed hash recorded) and settled after it (seed checked on-chain).
 */
export async function POST(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);

  const req = parsePlayRequest(await request.json().catch(() => null));
  if (typeof req === "string") return reply({ error: req }, 400);

  const table = getTable(req.tableId);
  const real = table.mode === "real";
  let agent: string | null = null;
  try {
    if (real) {
      // Real money needs a signed-in player with a deployed agent; practice is open to anyone.
      if (!(await sessionUser(session.id))) return reply({ error: "Sign in to play for real money" }, 401);
      agent = await sessionAgent(session.id);
      if (!agent) return reply({ error: "Deploy an agent first" }, 409);
      // The contract holds the truth about the agent's stack, not the browser.
      req.stack = await balanceOf(agent);
      if (req.stack < table.blinds.big) return reply({ error: "Your agent is out of chips at this table" }, 409);
    }

    const deal = await takeSeed(req.handId, session.id);
    if (!deal) return reply({ error: "Unknown, expired or already played hand" }, 404);

    const commitTx = agent ? await commitHand(req.handId, agent, deal.commitment, req.stack) : null;
    const hand = await playHand(req, deal);
    if (agent && commitTx) {
      const settleTx = await settleHand(req.handId, deal.seed, req.playerSeed, hand.stackAfter);
      hand.chain = { contract: process.env.NEAR_CONTRACT_ID!, agent, commitTx, settleTx };
      await recordHand(session.id, hand);
    }
    return reply(hand);
  } catch (e) {
    // Model or chain unavailable: stop and say so — never play it with a stand-in.
    if (e instanceof ServiceDownError) return reply({ error: e.message, code: "service_down" }, 503);
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}
