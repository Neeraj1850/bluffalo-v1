import { NextResponse } from "next/server";
import { getTable } from "@/lib/data/tables";
import { pendingHands, takeSeed, type PendingHand } from "@/lib/server/deals";
import { ServiceDownError } from "@/lib/server/decide";
import { recordHand } from "@/lib/server/hands";
import { payoutFor, rakeFor, sessionPayoutCap, stakeFor, TABLE_CLOSED, tableStatus } from "@/lib/server/economics";
import { commitment } from "@/lib/poker/fairness";
import { balanceOf, ChainError, commitHand, houseBalance, settleHand } from "@/lib/server/near";
import { CLAIM_AFTER_MS, claimExpired, parkUnsettled } from "@/lib/server/timeouts";
import { claimTable } from "@/lib/server/activeTable";
import { inFlight } from "@/lib/server/inFlight";
import { parsePlayRequest, playHand } from "@/lib/server/play";
import { backend } from "@/lib/server/backend";
import type { StrategyParams } from "@/lib/data/strategy";
import { sessionAgent, sessionAgentStrategy, sessionFrom, sessionUser, withSession } from "@/lib/server/sessions";


/**
 * Play a hand committed with POST /api/deal. The response reveals the seed.
 *
 * Practice: one request with `playerSeed`. Real money is two steps, so the
 * server can't see the deck before it's bound on-chain (no last look):
 *  1. `{ ...hand, playerCommitment }` (sha256 of the player seed) → the server
 *     commits both hashes and stakes on NEAR testnet → `{ handId, commitTx }`.
 *  2. `{ handId, playerSeed }` → checked against the commitment, played, and
 *     settled on-chain with both seeds → the hand.
 * If step 2 never settles, the contract's claim_timeout pays the player the pot.
 */
export async function POST(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);

  const body = await request.json().catch(() => null);
  if (body && typeof body === "object" && !("tableId" in body) && "playerSeed" in body) {
    return reveal(body as { handId?: unknown; playerSeed?: unknown }, session.id, reply);
  }
  const req = parsePlayRequest(body);
  if (typeof req === "string") return reply({ error: req }, 400);
  if (real(req.tableId) !== !!req.playerCommitment) {
    return reply({ error: real(req.tableId) ? "Real-money hands send playerCommitment first" : "Practice hands send playerSeed" }, 400);
  }

  const table = getTable(req.tableId);
  let agent: string | null = null;
  try {
    if (real(req.tableId)) {
      // Real money needs a signed-in player with a deployed agent; practice is open to anyone.
      if (!(await sessionUser(session.id))) return reply({ error: "Sign in to play for real money" }, 401);
      agent = await sessionAgent(session.id);
      if (!agent) return reply({ error: "Deploy an agent first" }, 409);
      // A licensed market strategy: the server's sealed params play, whatever the browser sent.
      const strategy = await sessionAgentStrategy(session.id);
      if (strategy) {
        const sealed = await backend<{ params: StrategyParams }>(`/strategies/${strategy}/params`);
        if (!sealed) return reply({ error: "This strategy is unavailable", code: "service_down" }, 503);
        req.params = sealed.params;
        req.strategy = strategy;
        delete req.preset;
      }
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

    // One table at a time: a practice test and a live sitting can't run side by side.
    const busy = claimTable(session.id, req.tableId);
    if (busy) {
      return reply(
        { error: `You're already playing at ${getTable(busy).name}. One table at a time — stop there first.`, code: "one_table" },
        409,
      );
    }

    const deal = await takeSeed(req.handId, session.id);
    if (!deal) return reply({ error: "Unknown, expired or already played hand" }, 404);

    if (!agent) {
      const hand = await playHand({ ...req, playerSeed: req.playerSeed! }, deal);
      // Practice hands are archived too (History → Practice, tested agents). Best effort:
      // a free hand shouldn't fail because the archive hiccuped.
      await recordHand(session.id, hand).catch((e) => console.error("[play] practice record failed", hand.id, e));
      return reply(hand);
    }

    // One real hand per agent at a time: a hand stakes the agent's balance (up to the exposure cap).
    if (inFlight.has(agent)) return reply({ error: "Your agent is already playing a hand" }, 409);
    const waiting = pendingHands.forAgent(agent);
    if (waiting) {
      // Withholding the seed can't be settled by the house, only timed out (paying the player):
      // so an unrevealed hand blocks the agent. Once claimable, make sure it gets claimed.
      if (Date.now() - waiting.at >= CLAIM_AFTER_MS) parkUnsettled(waiting.handId);
      return reply({ error: "Your agent has a committed hand waiting for your seed", code: "awaiting_reveal", handId: waiting.handId }, 409);
    }
    inFlight.add(agent);
    try {
      void claimExpired(); // close any earlier hand stuck past its on-chain timeout
      const commitTx = await commitHand(req.handId, agent, deal.commitment, req.playerCommitment!, req.stack);
      pendingHands.put({
        handId: req.handId,
        sessionId: session.id,
        agent,
        deal,
        playerCommitment: req.playerCommitment!,
        commitTx,
        tableId: req.tableId,
        stack: req.stack,
        at: Date.now(),
        req,
      });
      return reply({ handId: req.handId, commitTx });
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

const real = (tableId: string) => getTable(tableId).mode === "real";

/** Step 2 of a real-money hand: the player's seed for a hand already committed on-chain. */
async function reveal(
  b: { handId?: unknown; playerSeed?: unknown },
  sessionId: string,
  reply: (body: unknown, status?: number) => Response,
) {
  if (typeof b.handId !== "string" || typeof b.playerSeed !== "string" || !/^[0-9a-f]{32}$/.test(b.playerSeed)) {
    return reply({ error: "Invalid reveal" }, 400);
  }
  const p: PendingHand | null = pendingHands.get(b.handId, sessionId);
  if (!p?.req) return reply({ error: "Unknown or already revealed hand" }, 404);
  if ((await commitment(b.playerSeed)) !== p.playerCommitment) return reply({ error: "Seed doesn't match your commitment" }, 400);
  if (inFlight.has(p.agent)) return reply({ error: "Your agent is already playing a hand" }, 409);
  pendingHands.delete(p.handId);
  inFlight.add(p.agent);
  try {
    const hand = await playHand({ ...p.req, playerSeed: b.playerSeed }, p.deal);
    // The rake stays with the house: the contract keeps whatever of the pot isn't paid out.
    const rake = rakeFor(hand, getTable(p.tableId).blinds.big);
    const settleTx = await settleHand(p.handId, p.deal.seed, b.playerSeed, payoutFor(hand.stackAfter, rake));
    hand.rake = rake;
    hand.chain = { contract: process.env.NEAR_CONTRACT_ID!, agent: p.agent, commitTx: p.commitTx, settleTx };
    await recordHand(sessionId, hand);
    return reply(hand);
  } catch (e) {
    // Committed but not settled: nobody may void it early, so it pays the player
    // the pot once the contract's timeout passes. Park it to claim then.
    parkUnsettled(p.handId);
    if (e instanceof ServiceDownError) return reply({ error: e.message, code: "service_down" }, 503);
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  } finally {
    inFlight.delete(p.agent);
  }
}
