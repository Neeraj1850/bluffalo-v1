import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as hands } from "@/app/api/hands/route";
import { POST } from "@/app/api/play/route";
import { GET as runs } from "@/app/api/runs/route";
import { getPreset } from "@/lib/data/strategy";
import { commitment, verifyDeal } from "@/lib/poker/fairness";
import { leaveTable } from "@/lib/server/activeTable";
import { createDeal } from "@/lib/server/deals";
import { parsePlayRequest, playHand } from "@/lib/server/play";
import { MODELS } from "@/lib/server/nearai";
import { SESSION_COOKIE } from "@/lib/server/sessions";
import { useFakeBackend } from "@/tests/helpers/backend";
import { fakeNearAi } from "@/tests/helpers/nearai";
import { ChainError } from "@/lib/server/near";

// The testnet contract is mocked; its client is tested in near.test.ts and live on testnet.
const chain = vi.hoisted(() => ({ balanceOf: vi.fn(), commitHand: vi.fn(), settleHand: vi.fn(), houseBalance: vi.fn() }));
vi.mock("@/lib/server/near", async (orig) => ({ ...(await orig<object>()), ...chain }));

const params = getPreset("shark").params!;
const valid = { handId: "0123abcd", tableId: "back-room", params, stack: 50, button: 0 as const, playerSeed: "ffeeddccbbaa99887766554433221100" };
const ME = "00000000-0000-4000-8000-00000000000a";
const OTHER = "00000000-0000-4000-8000-00000000000b";
const headers = (id = ME) => ({ cookie: `${SESSION_COOKIE}=${id}` });
const raw = (body: unknown, id = ME) =>
  POST(new Request("http://x/api/play", { method: "POST", headers: headers(id), body: JSON.stringify(body) }));
/** Plays a hand the way the client does: real money commits sha256(seed) first, then reveals the seed. */
const post = async (body: unknown, id = ME) => {
  const b = body as Record<string, unknown>;
  if (b?.tableId === "kitchen" || typeof b?.playerSeed !== "string" || typeof b?.stack !== "number") return raw(body, id);
  const { playerSeed, ...rest } = b;
  const committed = await raw({ ...rest, playerCommitment: await commitment(playerSeed as string) }, id);
  if (committed.status !== 200) return committed;
  return raw({ handId: b.handId, playerSeed }, id);
};
let backend: ReturnType<typeof useFakeBackend>;
const archiveQ = async (q: string) =>
  (await (await hands(new Request(`http://x/api/hands${q}`, { headers: headers() }))).json()).hands;
const archive = async (id = ME, mode = "") =>
  (await (await hands(new Request(`http://x/api/hands${mode && `?mode=${mode}`}`, { headers: headers(id) }))).json()).hands;

// NEAR AI is faked: every model answers "call" (a check when nothing is owed), so hands reach showdown.
beforeEach(async () => {
  leaveTable(ME);
  vi.stubEnv("NEAR_AI_API_KEY", "test-key");
  backend = useFakeBackend(fakeNearAi({ action: "call", reason: "Keep it simple." }));
  backend.seedSession(ME, "did:privy:me", "ame.op.testnet");
  backend.seedSession(OTHER, "did:privy:other", "aother.op.testnet");
  vi.stubEnv("NEAR_CONTRACT_ID", "poker.testnet");
  chain.balanceOf.mockReset().mockResolvedValue(50);
  chain.commitHand.mockReset().mockResolvedValue("COMMIT_TX");
  chain.settleHand.mockReset().mockResolvedValue("SETTLE_TX");
  chain.houseBalance.mockReset().mockResolvedValue(10000); // 1% exposure cap = 100
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("parsePlayRequest", () => {
  it("accepts a hex session id and rejects anything else", () => {
    expect(parsePlayRequest({ ...valid, runId: "ab12cd34ef56" })).toMatchObject({ runId: "ab12cd34ef56" });
    for (const runId of ["AB12CD34", "ab12", 42]) expect(parsePlayRequest({ ...valid, runId })).toBe("Invalid runId");
  });

  it("accepts a valid request", () => {
    expect(parsePlayRequest(valid)).toEqual(valid);
    const rest = { ...valid, playerSeed: undefined };
    const c = "a".repeat(64);
    expect(parsePlayRequest({ ...rest, playerCommitment: c })).toEqual({ ...rest, playerCommitment: c });
  });

  it.each([
    ["a non-object", null],
    ["a bad hand id", { ...valid, handId: "../etc" }],
    ["an unknown table", { ...valid, tableId: "casino" }],
    ["a bad button", { ...valid, button: 2 }],
    ["a negative stack", { ...valid, stack: -5 }],
    ["a huge stack", { ...valid, stack: 1e9 }],
    ["a slider out of range", { ...valid, params: { ...params, bluff: 101 } }],
    ["a missing slider", { ...valid, params: { aggression: 50 } }],
    ["a missing player seed", { ...valid, playerSeed: undefined }],
    ["both a seed and a commitment", { ...valid, playerCommitment: "a".repeat(64) }],
    ["a malformed commitment", { ...valid, playerSeed: undefined, playerCommitment: "abc" }],
    ["a malformed player seed", { ...valid, playerSeed: "NOT-HEX" }],
  ])("rejects %s", (_, body) => {
    expect(typeof parsePlayRequest(body)).toBe("string");
  });
});

describe("playHand", () => {
  it("plays to the end and produces a verifiable record", async () => {
    const seed = "00112233445566778899aabbccddeeff";
    const deal = { seed, commitment: await commitment(seed) };
    const hand = await playHand(valid, deal, { rand: () => 0.5 });
    expect(hand.steps.at(-1)?.street).toBe("SHOWDOWN");
    expect(hand.table).toBe("the back room");
    expect(await verifyDeal(hand.proof)).toEqual({ ok: true });
  });

  it("never calls the model for the practice bot", async () => {
    const f = fakeNearAi({ action: "call" });
    const deal = { seed: "00112233445566778899aabbccddeeff", commitment: "c" };
    await playHand({ ...valid, tableId: "kitchen" }, deal, { fetch: f });
    const models = f.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).model);
    expect(models.every((m) => m === MODELS.agent)).toBe(true);
  });

  it("calls the opponent the practice bot on practice tables", async () => {
    const deal = { seed: "00112233445566778899aabbccddeeff", commitment: "c" };
    const hand = await playHand({ ...valid, tableId: "kitchen" }, deal, { rand: () => 0.5 });
    expect(hand.outcome).not.toMatch(/house agent/);
  });
});

describe("POST /api/play", () => {
  it("plays a committed hand and reveals its seed", async () => {
    const deal = await createDeal(ME);
    const res = await post({ ...valid, handId: deal.handId });
    expect(res.status).toBe(200);
    const hand = await res.json();
    expect(hand.proof.commitment).toBe(deal.commitment);
    expect(await verifyDeal(hand.proof)).toEqual({ ok: true });
  });

  it("requires sign-in for real money, but not for practice", async () => {
    const GUEST = "00000000-0000-4000-8000-00000000000c";
    backend.seedSession(GUEST);
    const real = await createDeal(GUEST);
    const res = await post({ ...valid, handId: real.handId }, GUEST);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in to play for real money" });
    const practice = await createDeal(GUEST);
    expect((await post({ ...valid, tableId: "kitchen", handId: practice.handId }, GUEST)).status).toBe(200);
  });

  it("commits on-chain before the deal and settles the ending stack after", async () => {
    const deal = await createDeal(ME);
    const hand = await (await post({ ...valid, handId: deal.handId })).json();
    // both seeds are bound on-chain before the deal: the player's seed hash too
    expect(chain.commitHand).toHaveBeenCalledWith(deal.handId, "ame.op.testnet", deal.commitment, await commitment(valid.playerSeed), 50);
    // the payout is the ending stack less the disclosed rake
    expect(hand.rake).toBeGreaterThanOrEqual(0);
    expect(chain.settleHand).toHaveBeenCalledWith(
      deal.handId,
      hand.proof.seed,
      valid.playerSeed,
      Math.round((hand.stackAfter - hand.rake) * 100) / 100,
    );
    expect(chain.commitHand.mock.invocationCallOrder[0]).toBeLessThan(chain.settleHand.mock.invocationCallOrder[0]);
    expect(hand.chain).toEqual({ contract: "poker.testnet", agent: "ame.op.testnet", commitTx: "COMMIT_TX", settleTx: "SETTLE_TX" });
  });

  it("takes the stack from the contract, not the browser", async () => {
    chain.balanceOf.mockResolvedValueOnce(37.5);
    const deal = await createDeal(ME);
    await post({ ...valid, stack: 9999, handId: deal.handId });
    expect(chain.commitHand.mock.calls[0][4]).toBe(37.5);
  });

  it("stakes at most the house's exposure cap, leaving the rest of the balance unlocked", async () => {
    chain.balanceOf.mockResolvedValueOnce(90);
    chain.houseBalance.mockResolvedValueOnce(5000); // 1% = 50
    const deal = await createDeal(ME);
    await post({ ...valid, handId: deal.handId });
    expect(chain.commitHand.mock.calls[0][4]).toBe(50);
  });

  it("answers 503 table_closed below the house floor, before committing", async () => {
    chain.houseBalance.mockResolvedValueOnce(1999);
    const deal = await createDeal(ME);
    const res = await post({ ...valid, handId: deal.handId });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Table closed — the house is rebalancing", code: "table_closed" });
    expect(chain.commitHand).not.toHaveBeenCalled();
  });

  it("asks the agent to cash out once it reaches the session payout cap", async () => {
    chain.balanceOf.mockResolvedValueOnce(300); // 3 × max buy-in 100
    const deal = await createDeal(ME);
    const res = await post({ ...valid, handId: deal.handId });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("session_cap");
    expect(chain.commitHand).not.toHaveBeenCalled();
  });

  it("needs a deployed agent with chips for real money", async () => {
    const NEW = "00000000-0000-4000-8000-00000000000d";
    backend.seedSession(NEW, "did:privy:new");
    let deal = await createDeal(NEW);
    expect((await post({ ...valid, handId: deal.handId }, NEW)).status).toBe(409);
    chain.balanceOf.mockResolvedValueOnce(0.5);
    deal = await createDeal(ME);
    expect(await (await post({ ...valid, handId: deal.handId })).json()).toEqual({ error: "Your agent is out of chips at this table" });
  });

  it("never touches the chain for practice hands", async () => {
    const deal = await createDeal(ME);
    await post({ ...valid, tableId: "kitchen", handId: deal.handId });
    expect(chain.balanceOf).not.toHaveBeenCalled();
    expect(chain.commitHand).not.toHaveBeenCalled();
  });

  it("answers 503 chain_down when testnet fails, and records nothing", async () => {
    chain.commitHand.mockRejectedValueOnce(new ChainError());
    const deal = await createDeal(ME);
    const res = await post({ ...valid, handId: deal.handId });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("chain_down");
    expect(await archive()).toEqual([]);
  });

  it("refuses another session's hand", async () => {
    const deal = await createDeal(ME);
    expect((await post({ ...valid, handId: deal.handId }, OTHER)).status).toBe(404);
  });

  it("records real-money hands for this session only", async () => {
    const deal = await createDeal(ME);
    const hand = await (await post({ ...valid, handId: deal.handId })).json();
    expect((await archive()).map((h: { id: string }) => h.id)).toEqual([hand.id]);
    expect(await archive(OTHER)).toEqual([]);
  });

  it("archives practice hands separately, tagged with mode, table and strategy", async () => {
    const deal = await createDeal(ME);
    const hand = await (await post({ ...valid, preset: "shark", tableId: "kitchen", handId: deal.handId })).json();
    expect(await archive()).toEqual([]); // the real-money list stays real
    const [practice] = await archive(ME, "practice");
    expect(practice).toMatchObject({ id: hand.id, mode: "practice", tableId: "kitchen", agent: { preset: "shark", params: valid.params } });
    expect(typeof practice.at).toBe("number");
  });

  it("groups hands into sessions by run id, one mode at a time", async () => {
    for (const [tableId, runId] of [["kitchen", "aaaa1111"], ["kitchen", "aaaa1111"], ["kitchen", "bbbb2222"], ["back-room", "cccc3333"]]) {
      if (tableId === "back-room") leaveTable(ME); // stopped practice before going live
      const deal = await createDeal(ME);
      await post({ ...valid, tableId, runId, handId: deal.handId });
    }
    const get = async (q: string) =>
      (await (await runs(new Request(`http://x/api/runs${q}`, { headers: headers() }))).json()).runs;
    const practice = await get("?mode=practice");
    expect(practice.map((r: { id: string; hands: number }) => [r.id, r.hands]).sort()).toEqual([["aaaa1111", 2], ["bbbb2222", 1]]);
    expect((await get("")).map((r: { id: string }) => r.id)).toEqual(["cccc3333"]); // real by default
    const one = await archiveQ("?mode=practice&run=aaaa1111");
    expect(one).toHaveLength(2);
    expect(one.every((h: { run: string }) => h.run === "aaaa1111")).toBe(true);
    expect((await hands(new Request("http://x/api/hands?run=BAD", { headers: headers() }))).status).toBe(400);
  });

  it("refuses a second table while the player is mid-play at another", async () => {
    const first = await createDeal(ME);
    expect((await post({ ...valid, tableId: "kitchen", handId: first.handId })).status).toBe(200);
    const second = await createDeal(ME);
    const res = await post({ ...valid, handId: second.handId });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "one_table" });
  });

  it("tags real-money hands as real", async () => {
    const deal = await createDeal(ME);
    await post({ ...valid, handId: deal.handId });
    expect((await archive())[0]).toMatchObject({ mode: "real", tableId: valid.tableId });
  });

  it("answers 503 service_down when NEAR AI is unavailable, and records nothing", async () => {
    backend = useFakeBackend(vi.fn(async () => new Response("{}", { status: 429 })));
    backend.seedSession(ME, "did:privy:me", "ame.op.testnet");
    const deal = await createDeal(ME);
    const res = await post({ ...valid, handId: deal.handId });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: "service_down", error: "The agent service is down right now. Try again in a minute." });
    expect(await archive()).toEqual([]);
  });

  it("refuses to play a hand twice", async () => {
    const deal = await createDeal(ME);
    await post({ ...valid, handId: deal.handId });
    expect((await post({ ...valid, handId: deal.handId })).status).toBe(404);
  });

  it("rejects invalid input with 400", async () => {
    expect((await post({ ...valid, stack: "lots" })).status).toBe(400);
  });
});

describe("POST /api/play commit-then-reveal (no last look)", () => {
  it("commits with only the seed hash, returns no hand, then plays on reveal", async () => {
    const deal = await createDeal(ME);
    const playerCommitment = await commitment(valid.playerSeed);
    const rest = { ...valid, playerSeed: undefined };
    const step1 = await raw({ ...rest, handId: deal.handId, playerCommitment });
    expect(step1.status).toBe(200);
    expect(await step1.json()).toEqual({ handId: deal.handId, commitTx: "COMMIT_TX" });
    expect(chain.commitHand).toHaveBeenCalledWith(deal.handId, "ame.op.testnet", deal.commitment, playerCommitment, 50);
    expect(chain.settleHand).not.toHaveBeenCalled();
    // the agent is blocked from another hand while this one waits for the seed
    const other = await createDeal(ME);
    const blocked = await raw({ ...rest, handId: other.handId, playerCommitment });
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).code).toBe("awaiting_reveal");

    const hand = await (await raw({ handId: deal.handId, playerSeed: valid.playerSeed })).json();
    expect(hand.proof.playerSeed).toBe(valid.playerSeed);
    expect(chain.settleHand).toHaveBeenCalledWith(deal.handId, hand.proof.seed, valid.playerSeed, expect.any(Number));
    expect((await raw({ handId: deal.handId, playerSeed: valid.playerSeed })).status).toBe(404); // once only
  });

  it("refuses a seed in the committing request for real money", async () => {
    const deal = await createDeal(ME);
    expect((await raw({ ...valid, handId: deal.handId })).status).toBe(400);
    expect(chain.commitHand).not.toHaveBeenCalled();
  });

  it("refuses a reveal that doesn't match the commitment, or from another session", async () => {
    const deal = await createDeal(ME);
    const rest = { ...valid, playerSeed: undefined };
    await raw({ ...rest, handId: deal.handId, playerCommitment: await commitment(valid.playerSeed) });
    expect((await raw({ handId: deal.handId, playerSeed: "0".repeat(32) })).status).toBe(400);
    expect((await raw({ handId: deal.handId, playerSeed: valid.playerSeed }, OTHER)).status).toBe(404);
    expect(chain.settleHand).not.toHaveBeenCalled();
    expect((await raw({ handId: deal.handId, playerSeed: valid.playerSeed })).status).toBe(200);
  });
});

describe("POST /api/play with a licensed strategy", () => {
  it("plays the sealed params and records only the token", async () => {
    backend.seedAgentStrategy(ME, "s1");
    backend.strategies.set("s1", { params: { aggression: 1, bluff: 2, position: 3, sizing: 4 }, salt: "x", params_hash: "y" });
    const { handId } = await createDeal(ME);
    const res = await post({ ...valid, handId, tableId: "back-room", preset: "shark" });
    expect(res.status).toBe(200);
    const hand = await res.json();
    expect(hand.agent).toEqual({ strategy: "s1" });
    expect(JSON.stringify(hand.steps)).not.toMatch(/\d+\s*\/\s*100/);
  });
});
