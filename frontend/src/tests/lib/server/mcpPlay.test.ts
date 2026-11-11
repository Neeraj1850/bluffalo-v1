import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshDeck } from "@/lib/poker/deck";
import { type Action, type Legal } from "@/lib/poker/game";
import { listHands } from "@/lib/server/hands";
import { applyExternalAction, startHand } from "@/lib/server/liveHand";
import { liveDeps, mapAction, sweepStaleHands } from "@/lib/server/mcpPlay";
import { useFakeBackend } from "@/tests/helpers/backend";
import { fakeNearAi } from "@/tests/helpers/nearai";

// The testnet contract is mocked; its client is tested in near.test.ts and live on testnet.
const chain = vi.hoisted(() => ({ settleHand: vi.fn(), cancelHand: vi.fn() }));
vi.mock("@/lib/server/near", async (orig) => ({ ...(await orig<object>()), ...chain }));

const SID = "sess-1";
const DEAL = { seed: "a".repeat(32), commitment: "b".repeat(64), playerSeed: "c".repeat(32) };
const passive = (l: Legal): Action => (l.canCheck ? { type: "check" } : { type: "call" });

// NEAR AI is faked: the house always answers "call" (a check when nothing is owed), so hands reach showdown.
beforeEach(() => {
  vi.stubEnv("NEAR_AI_API_KEY", "test-key");
  vi.stubEnv("NEAR_CONTRACT_ID", "poker.testnet");
  const backend = useFakeBackend(fakeNearAi({ action: "call", reason: "Keep it simple." }));
  backend.seedSession(SID, "did:privy:me", "ame.op.testnet");
  chain.settleHand.mockReset().mockResolvedValue("SETTLE_TX");
  chain.cancelHand.mockReset().mockResolvedValue("CANCEL_TX");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("mapAction", () => {
  it("maps the four moves and demands an amount for a raise", () => {
    expect(mapAction("fold")).toEqual({ type: "fold" });
    expect(mapAction("check")).toEqual({ type: "check" });
    expect(mapAction("call")).toEqual({ type: "call" });
    expect(mapAction("raise", 6)).toEqual({ type: "raise", to: 6 });
    expect(typeof mapAction("raise")).toBe("string"); // no amount
    expect(typeof mapAction("bogus")).toBe("string");
  });
});

describe("liveDeps (MCP play wiring)", () => {
  it("settles on-chain, attaches the chain record, and archives the hand", async () => {
    let result = await startHand(liveDeps, {
      handId: "0123abcd",
      sessionId: SID,
      tableName: "the back room",
      deck: freshDeck(),
      stacks: [50, 50],
      blinds: { small: 0.5, big: 1 },
      button: 0,
      deal: DEAL,
      agent: "ame.op.testnet",
      commitTx: "COMMIT_TX",
    });
    while (!result.done) result = await applyExternalAction(liveDeps, "0123abcd", passive(result.view.legal));

    expect(result.done).toBe(true);
    if (result.done) {
      expect(result.settled).toBe(true);
      expect(chain.settleHand).toHaveBeenCalledOnce();
      expect(result.hand.chain).toMatchObject({
        contract: "poker.testnet",
        agent: "ame.op.testnet",
        commitTx: "COMMIT_TX",
        settleTx: "SETTLE_TX",
      });
    }
    expect(await listHands(SID)).toHaveLength(1);
  });

  it("sweeps an abandoned hand: acts for the idle agent and settles it", async () => {
    await startHand(liveDeps, {
      handId: "0123abcd",
      sessionId: SID,
      tableName: "the back room",
      deck: freshDeck(),
      stacks: [50, 50],
      blinds: { small: 0.5, big: 1 },
      button: 0, // agent owes the small blind and must act — it's now idle on seat 0
      deal: DEAL,
      agent: "ame.op.testnet",
      commitTx: "COMMIT_TX",
    });
    const swept = await sweepStaleHands(Date.now() + 5000);
    expect(swept).toBe(1);
    expect(chain.settleHand).toHaveBeenCalledOnce();
    expect(await listHands(SID)).toHaveLength(1);
  });

  it("refunds (cancels) instead of locking funds when settlement fails", async () => {
    chain.settleHand.mockRejectedValue(new Error("testnet unreachable"));
    let result = await startHand(liveDeps, {
      handId: "0123abcd",
      sessionId: SID,
      tableName: "the back room",
      deck: freshDeck(),
      stacks: [50, 50],
      blinds: { small: 0.5, big: 1 },
      button: 0,
      deal: DEAL,
      agent: "ame.op.testnet",
      commitTx: "COMMIT_TX",
    });
    while (!result.done) result = await applyExternalAction(liveDeps, "0123abcd", passive(result.view.legal));
    if (result.done) expect(result.settled).toBe(false);
    expect(chain.cancelHand).toHaveBeenCalledOnce();
    expect(await listHands(SID)).toHaveLength(0);
  });
});
