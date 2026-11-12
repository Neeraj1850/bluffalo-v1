import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPreset } from "@/lib/data/strategy";
import { commitment } from "@/lib/poker/fairness";
import { useFakeBackend } from "@/tests/helpers/backend";
import { fakeNearAi } from "@/tests/helpers/nearai";

const chain = vi.hoisted(() => ({ balanceOf: vi.fn(), commitHand: vi.fn(), settleHand: vi.fn(), houseBalance: vi.fn() }));
vi.mock("@/lib/server/near", async (orig) => ({ ...(await orig<object>()), ...chain }));

const ME = "00000000-0000-4000-8000-00000000000a";
const AGENT = "ame.op.testnet";
const params = getPreset("shark").params!;
const req = { tableId: "back-room", params, stack: 50, button: 0 as const, runId: "ab12cd34" };
let backend: ReturnType<typeof useFakeBackend>;

beforeEach(() => {
  vi.stubEnv("NEAR_AI_API_KEY", "test-key");
  vi.stubEnv("NEAR_CONTRACT_ID", "poker.testnet");
  backend = useFakeBackend(fakeNearAi({ action: "call", reason: "Keep it simple." }));
  backend.seedSession(ME, "did:privy:me", AGENT);
  chain.balanceOf.mockReset().mockResolvedValue(50);
  chain.commitHand.mockReset().mockResolvedValue("COMMIT_TX");
  chain.settleHand.mockReset().mockResolvedValue("SETTLE_TX");
  chain.houseBalance.mockReset().mockResolvedValue(10000);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("playRealHand (server-held seed)", () => {
  it("commits sha256(playerSeed) on-chain before the seed is used, then settles and records", async () => {
    const { playRealHand } = await import("@/lib/server/realHand");
    const hand = await playRealHand(ME, req);
    const [handId, agent, , playerCommitment] = chain.commitHand.mock.calls[0];
    expect(agent).toBe(AGENT);
    expect(playerCommitment).toBe(await commitment(hand.proof!.playerSeed!));
    expect(chain.commitHand.mock.invocationCallOrder[0]).toBeLessThan(chain.settleHand.mock.invocationCallOrder[0]);
    expect(chain.settleHand.mock.calls[0][2]).toBe(hand.proof!.playerSeed);
    expect(hand.chain).toMatchObject({ commitTx: "COMMIT_TX", settleTx: "SETTLE_TX" });
    expect(backend.pending.get(handId)?.revealed).toBe(true);
  });
});

describe("pending reveals survive a restart", () => {
  it("still blocks the agent, and the player can still reveal", async () => {
    const { POST } = await import("@/app/api/play/route");
    const { createDeal } = await import("@/lib/server/deals");
    const { SESSION_COOKIE } = await import("@/lib/server/sessions");
    const post = (body: unknown) =>
      POST(new Request("http://x/api/play", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${ME}` }, body: JSON.stringify(body) }));
    const seed = "ffeeddccbbaa99887766554433221100";
    const { handId } = await createDeal(ME);
    expect((await post({ ...req, handId, playerCommitment: await commitment(seed) })).status).toBe(200);

    vi.resetModules(); // the server restarts: every in-memory map is gone, the backend isn't
    const fresh = (await import("@/app/api/play/route")).POST;
    const freshPost = (body: unknown) =>
      fresh(new Request("http://x/api/play", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${ME}` }, body: JSON.stringify(body) }));
    const next = await (await import("@/lib/server/deals")).createDeal(ME);
    const blocked = await freshPost({ ...req, handId: next.handId, playerCommitment: "a".repeat(64) });
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ code: "awaiting_reveal", handId });

    const revealed = await freshPost({ handId, playerSeed: seed });
    expect(revealed.status).toBe(200);
    expect((await revealed.json()).proof.playerSeed).toBe(seed);
    expect((await freshPost({ handId, playerSeed: seed })).status).toBe(404); // once
  });
});
