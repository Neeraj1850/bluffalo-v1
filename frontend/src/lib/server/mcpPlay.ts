import type { Action } from "@/lib/poker/game";
import { decide } from "./decide";
import { recordHand } from "./hands";
import { type Deps, timeoutHand } from "./liveHand";
import { backendStore } from "./liveHandStore";
import { cancelHand, settleHand } from "./near";

/**
 * Wiring for the live-hand machine used by the MCP play tools (see api/mcp): a
 * durable store, the house model, and on-chain settle/refund. Kept out of the
 * route file so it can be tested without the MCP protocol layer.
 */
export const liveDeps: Deps = {
  store: backendStore(),
  house: async (state) => (await decide(state, null)).action,
  // Settle on-chain first; recording the hand off-chain is best-effort (a throw here
  // would make the machine needlessly refund an already-settled hand).
  onSettle: async (rec, hand) => {
    const settleTx = await settleHand(rec.handId, rec.deal.seed, rec.deal.playerSeed, hand.stackAfter);
    if (rec.agent && rec.commitTx) {
      hand.chain = { contract: process.env.NEAR_CONTRACT_ID!, agent: rec.agent, commitTx: rec.commitTx, settleTx };
    }
    try {
      await recordHand(rec.sessionId, hand);
    } catch {
      /* chain is settled; the history row is best-effort */
    }
  },
  onCancel: async (rec) => {
    await cancelHand(rec.handId);
  },
};

/**
 * Act for every hand left idle on the external agent since before `cutoff`,
 * settling or refunding each so its on-chain stakes never stay locked. One bad
 * hand (model/chain down) is skipped, not fatal — the next sweep retries it.
 * Returns the number swept. Call it from a cron via POST /api/mcp/sweep.
 */
export async function sweepStaleHands(cutoff: number): Promise<number> {
  const stale = await liveDeps.store.stale(cutoff);
  for (const rec of stale) {
    try {
      await timeoutHand(liveDeps, rec.handId);
    } catch {
      /* leave it for the next sweep */
    }
  }
  return stale.length;
}

/** Map an external agent's `act` input to a game action, or an error message. */
export function mapAction(action: string, amount?: number): Action | string {
  switch (action) {
    case "fold":
      return { type: "fold" };
    case "check":
      return { type: "check" };
    case "call":
      return { type: "call" };
    case "raise":
      if (typeof amount !== "number") return "raise needs an amount (your total bet this street)";
      return { type: "raise", to: amount };
    default:
      return `Unknown action: ${action}`;
  }
}
