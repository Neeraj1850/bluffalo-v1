import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as hands } from "@/app/api/hands/route";
import { POST } from "@/app/api/play/route";
import { getPreset } from "@/lib/data/strategy";
import { commitment, verifyDeal } from "@/lib/poker/fairness";
import { createDeal } from "@/lib/server/deals";
import { parsePlayRequest, playHand } from "@/lib/server/play";
import { SESSION_COOKIE } from "@/lib/server/sessions";
import { useFakeBackend } from "@/tests/helpers/backend";
import { fakeGroq } from "@/tests/helpers/groq";
import { ChainError } from "@/lib/server/near";

// The testnet contract is mocked; its client is tested in near.test.ts and live on testnet.
const chain = vi.hoisted(() => ({ balanceOf: vi.fn(), commitHand: vi.fn(), settleHand: vi.fn() }));
vi.mock("@/lib/server/near", async (orig) => ({ ...(await orig<object>()), ...chain }));

const params = getPreset("shark").params!;
const valid = { handId: "0123abcd", tableId: "back-room", params, stack: 50, button: 0 as const, playerSeed: "ffeeddccbbaa99887766554433221100" };
const ME = "00000000-0000-4000-8000-00000000000a";
const OTHER = "00000000-0000-4000-8000-00000000000b";
const headers = (id = ME) => ({ cookie: `${SESSION_COOKIE}=${id}` });
const post = (body: unknown, id = ME) =>
  POST(new Request("http://x/api/play", { method: "POST", headers: headers(id), body: JSON.stringify(body) }));
let backend: ReturnType<typeof useFakeBackend>;
const archive = async (id = ME) => (await (await hands(new Request("http://x/api/hands", { headers: headers(id) }))).json()).hands;

// Groq is faked: every model answers "call" (a check when nothing is owed), so hands reach showdown.
beforeEach(async () => {
  vi.stubEnv("GROQ_API_KEY", "test-key");
  backend = useFakeBackend(fakeGroq({ action: "call", reason: "Keep it simple." }));
  backend.seedSession(ME, "did:privy:me", "ame.op.testnet");
  backend.seedSession(OTHER, "did:privy:other", "aother.op.testnet");
  vi.stubEnv("NEAR_CONTRACT_ID", "poker.testnet");
  chain.balanceOf.mockReset().mockResolvedValue(50);
  chain.commitHand.mockReset().mockResolvedValue("COMMIT_TX");
  chain.settleHand.mockReset().mockResolvedValue("SETTLE_TX");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("parsePlayRequest", () => {
  it("accepts a valid request", () => {
    expect(parsePlayRequest(valid)).toEqual(valid);
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
    const f = fakeGroq({ action: "call" });
    const deal = { seed: "00112233445566778899aabbccddeeff", commitment: "c" };
    await playHand({ ...valid, tableId: "kitchen" }, deal, { fetch: f });
    const models = f.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).model);
    expect(models.every((m) => m === "openai/gpt-oss-120b")).toBe(true);
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
    expect(chain.commitHand).toHaveBeenCalledWith(deal.handId, "ame.op.testnet", deal.commitment, 50);
    expect(chain.settleHand).toHaveBeenCalledWith(deal.handId, hand.proof.seed, valid.playerSeed, hand.stackAfter);
    expect(chain.commitHand.mock.invocationCallOrder[0]).toBeLessThan(chain.settleHand.mock.invocationCallOrder[0]);
    expect(hand.chain).toEqual({ contract: "poker.testnet", agent: "ame.op.testnet", commitTx: "COMMIT_TX", settleTx: "SETTLE_TX" });
  });

  it("takes the stack from the contract, not the browser", async () => {
    chain.balanceOf.mockResolvedValueOnce(37.5);
    const deal = await createDeal(ME);
    await post({ ...valid, stack: 9999, handId: deal.handId });
    expect(chain.commitHand.mock.calls[0][3]).toBe(37.5);
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

  it("doesn't archive practice hands", async () => {
    const deal = await createDeal(ME);
    await post({ ...valid, tableId: "kitchen", handId: deal.handId });
    expect(await archive()).toEqual([]);
  });

  it("answers 503 service_down when Groq is unavailable, and records nothing", async () => {
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
