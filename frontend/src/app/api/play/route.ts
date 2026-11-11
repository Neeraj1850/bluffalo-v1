import { NextResponse } from "next/server";
import { getTable } from "@/lib/data/tables";
import { takeSeed } from "@/lib/server/deals";
import { ServiceDownError } from "@/lib/server/decide";
import { recordHand } from "@/lib/server/hands";
import { payoutFor, rakeFor, sessionPayoutCap, stakeFor, TABLE_CLOSED, tableStatus } from "@/lib/server/economics";
import { balanceOf, ChainError, cancelHand, commitHand, houseBalance, settleHand } from "@/lib/server/near";
import { inFlight } from "@/lib/server/inFlight";
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
      const [balance, house] = await Promise.all([balanceOf(agent), houseBalance()]);
      // Disclosed bankroll limits: the table closes when the house runs low, and
      // the house never stakes more than its exposure cap on one hand.
      if (!tableStatus(table, house).open) return reply(TABLE_CLOSED, 503);
      if (balance >= sessionPayoutCap(table, house)) {
        return reply({ error: "Your agent hit this table's session limit — cash out to keep playing", code: "session_cap" }, 409);
      }
      req.stack = stakeFor(balance, house);
      if (req.stack < table.blinds.big) return reply({ error: "Your agent is out of chips at this table" }, 409);
    }

    const deal = await takeSeed(req.handId, session.id);
    if (!deal) return reply({ error: "Unknown, expired or already played hand" }, 404);

    if (!agent) {
      const hand = await playHand(req, deal);
      // Practice hands are archived too (History → Practice, tested agents). Best effort:
      // a free hand shouldn't fail because the archive hiccuped.
      await recordHand(session.id, hand).catch((e) => console.error("[play] practice record failed", hand.id, e));
      return reply(hand);
    }

    // One real hand per agent at a time: a hand stakes the agent's balance (up to the exposure cap).
    if (inFlight.has(agent)) return reply({ error: "Your agent is already playing a hand" }, 409);
    inFlight.add(agent);
    try {
      const commitTx = await commitHand(req.handId, agent, deal.commitment, req.stack);
      try {
        const hand = await playHand(req, deal);
        // The rake stays with the house: the contract keeps whatever of the pot isn't paid out.
        const rake = rakeFor(hand, table.blinds.big);
        const settleTx = await settleHand(req.handId, deal.seed, req.playerSeed, payoutFor(hand.stackAfter, rake));
        hand.rake = rake;
        hand.chain = { contract: process.env.NEAR_CONTRACT_ID!, agent, commitTx, settleTx };
        await recordHand(session.id, hand);
        return reply(hand);
      } catch (e) {
        // Committed but not settled: give both stakes back so nothing stays locked.
        await cancelHand(req.handId).catch((err) => console.error("[play] cancel_hand failed", req.handId, err));
        throw e;
      }
    } finally {
      inFlight.delete(agent);
    }
  } catch (e) {
    // Model or chain unavailable: stop and say so — never play it with a stand-in.
    if (e instanceof ServiceDownError) return reply({ error: e.message, code: "service_down" }, 503);
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}
