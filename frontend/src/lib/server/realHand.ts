import { getTable } from "@/lib/data/tables";
import type { StrategyParams } from "@/lib/data/strategy";
import { commitment, newSeed } from "@/lib/poker/fairness";
import type { LiveHand } from "@/lib/poker/record";
import { claimTable } from "./activeTable";
import { backend } from "./backend";
import { createDeal, pendingHands, takeSeed } from "./deals";
import { ServiceDownError } from "./decide";
import { payoutFor, rakeFor, sessionPayoutCap, stakeFor, TABLE_CLOSED, tableStatus } from "./economics";
import { recordHand } from "./hands";
import { inFlight } from "./inFlight";
import { balanceOf, ChainError, commitHand, houseBalance, settleHand } from "./near";
import { playHand, type PlayRequest } from "./play";
import { sessionAgent, sessionAgentStrategy, sessionUser } from "./sessions";
import { CLAIM_AFTER_MS, claimExpired, parkUnsettled } from "./timeouts";

/**
 * The real-money hand pipeline, shared by /api/play (browser), MCP and server
 * autoplay: stake checks → commit both seed hashes on-chain → reveal → play →
 * settle → record. The player seed is only ever used after its hash is bound.
 */

/** A refusal with the HTTP status and body /api/play answers with. */
export class PlayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PlayError";
  }
}

/** The response for a pipeline error, or null if it's unexpected (rethrow it). */
export function playErrorResponse(e: unknown): { status: number; body: Record<string, unknown> } | null {
  if (e instanceof PlayError) return { status: e.status, body: { error: e.message, ...(e.code ? { code: e.code } : {}), ...e.extra } };
  // Model or chain unavailable: stop and say so — never play it with a stand-in.
  if (e instanceof ServiceDownError) return { status: 503, body: { error: e.message, code: "service_down" } };
  if (e instanceof ChainError) return { status: 503, body: { error: e.message, code: "chain_down" } };
  return null;
}

/**
 * Who plays and for how much: a signed-in player's deployed agent, a licensed
 * strategy's sealed params, and the stake the contract and house allow.
 * Sets `req.params` / `req.stack`; returns the agent account.
 */
export async function prepareReal(sessionId: string, req: PlayRequest): Promise<string> {
  if (!(await sessionUser(sessionId))) throw new PlayError("Sign in to play for real money", 401);
  const agent = await sessionAgent(sessionId);
  if (!agent) throw new PlayError("Deploy an agent first", 409);
  // A licensed market strategy: the server's sealed params play, whatever the browser sent.
  const strategy = await sessionAgentStrategy(sessionId);
  if (strategy) {
    const sealed = await backend<{ params: StrategyParams }>(`/strategies/${strategy}/params`);
    if (!sealed) throw new PlayError("This strategy is unavailable", 503, "service_down");
    req.params = sealed.params;
    req.strategy = strategy;
    delete req.preset;
  }
  const table = getTable(req.tableId);
  // The contract holds the truth about the agent's stack, not the browser.
  const [balance, house] = await Promise.all([balanceOf(agent), houseBalance()]);
  // Disclosed bankroll limits: the table closes when the house runs low, and
  // the house never stakes more than its exposure cap on one hand.
  if (!tableStatus(table, house).open) throw new PlayError(TABLE_CLOSED.error, 503, TABLE_CLOSED.code);
  if (balance >= sessionPayoutCap(table, house)) {
    throw new PlayError("Your agent hit this table's session limit — cash out to keep playing", 409, "session_cap");
  }
  req.stack = stakeFor(balance, house);
  if (req.stack < table.blinds.big) throw new PlayError("Your agent is out of chips at this table", 409);
  return agent;
}

/** One table at a time: a practice test and a live sitting can't run side by side. */
export function claimTableOrThrow(sessionId: string, tableId: string) {
  const busy = claimTable(sessionId, tableId);
  if (busy) {
    throw new PlayError(`You're already playing at ${getTable(busy).name}. One table at a time — stop there first.`, 409, "one_table");
  }
}

/** Throws if the agent can't start a hand: one in flight, or one committed and awaiting its seed. */
export async function assertAgentFree(agent: string) {
  // One real hand per agent at a time: a hand stakes the agent's balance (up to the exposure cap).
  if (inFlight.has(agent)) throw new PlayError("Your agent is already playing a hand", 409, "busy");
  const waiting = await pendingHands.forAgent(agent);
  if (waiting) {
    // Withholding the seed can't be settled by the house, only timed out (paying the player):
    // so an unrevealed hand blocks the agent. Once claimable, make sure it gets claimed.
    if (Date.now() - waiting.at >= CLAIM_AFTER_MS) {
      parkUnsettled(waiting.handId, waiting.at);
      void claimExpired();
    }
    throw new PlayError("Your agent has a committed hand waiting for your seed", 409, "awaiting_reveal", { handId: waiting.handId });
  }
}

/** Step 1: bind both seed hashes and the stakes on-chain, and remember the hand until it's revealed. */
export async function commitReal(
  p: { sessionId: string; agent: string; deal: { seed: string; commitment: string }; playerCommitment: string; req?: PlayRequest; autoSeed?: string; tableId: string; stack: number; handId: string },
): Promise<string> {
  await assertAgentFree(p.agent);
  inFlight.add(p.agent);
  try {
    void claimExpired(); // close any earlier hand stuck past its on-chain timeout
    const commitTx = await commitHand(p.handId, p.agent, p.deal.commitment, p.playerCommitment, p.stack);
    try {
      await pendingHands.put({ ...p, commitTx });
    } catch (e) {
      // Committed but untracked: it can only be timed out now (paying the player).
      parkUnsettled(p.handId);
      throw e;
    }
    return commitTx;
  } finally {
    inFlight.delete(p.agent);
  }
}

/** Step 2: the player's seed for a committed hand → played, settled on-chain, recorded. */
export async function revealReal(sessionId: string, handId: string, playerSeed: string): Promise<LiveHand> {
  const p = await pendingHands.get(handId, sessionId);
  if (!p?.req) throw new PlayError("Unknown or already revealed hand", 404);
  if ((await commitment(playerSeed)) !== p.playerCommitment) throw new PlayError("Seed doesn't match your commitment", 400);
  if (inFlight.has(p.agent)) throw new PlayError("Your agent is already playing a hand", 409, "busy");
  inFlight.add(p.agent);
  try {
    // Exactly once, even across two requests racing with the same seed.
    if (!(await pendingHands.take(handId))) throw new PlayError("Unknown or already revealed hand", 404);
    try {
      const hand = await playHand({ ...p.req, playerSeed }, p.deal);
      // The rake stays with the house: the contract keeps whatever of the pot isn't paid out.
      const rake = rakeFor(hand, getTable(p.tableId).blinds.big);
      const settleTx = await settleHand(handId, p.deal.seed, playerSeed, payoutFor(hand.stackAfter, rake));
      hand.rake = rake;
      hand.chain = { contract: process.env.NEAR_CONTRACT_ID!, agent: p.agent, commitTx: p.commitTx, settleTx };
      await recordHand(sessionId, hand);
      return hand;
    } catch (e) {
      // Committed but not settled: nobody may void it early, so it pays the player
      // the pot once the contract's timeout passes. Park it to claim then.
      parkUnsettled(handId);
      throw e;
    }
  } finally {
    inFlight.delete(p.agent);
  }
}

/**
 * A whole hand with a server-chosen player seed (server autoplay). Same order as
 * the browser — sha256(seed) is committed on-chain before the seed is used — but
 * the server holds both seeds, so this is weaker than browser mode: it relies on
 * the operator not grinding seeds, not on cryptography.
 */
export async function playRealHand(
  sessionId: string,
  req: Omit<PlayRequest, "handId" | "playerSeed" | "playerCommitment">,
): Promise<LiveHand> {
  const full: PlayRequest = { ...req, handId: "" };
  const agent = await prepareReal(sessionId, full);
  claimTableOrThrow(sessionId, req.tableId);
  await assertAgentFree(agent);
  const { handId } = await createDeal(sessionId);
  const deal = await takeSeed(handId, sessionId);
  if (!deal) throw new PlayError("Could not claim the deal", 503, "service_down");
  full.handId = handId;
  const seed = newSeed();
  const playerCommitment = await commitment(seed);
  await commitReal({ sessionId, agent, deal, playerCommitment, req: { ...full, playerCommitment }, autoSeed: seed, tableId: req.tableId, stack: full.stack, handId });
  return revealReal(sessionId, handId, seed);
}
