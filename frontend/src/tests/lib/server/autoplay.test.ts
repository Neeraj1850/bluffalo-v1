import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPreset } from "@/lib/data/strategy";
import { useFakeBackend } from "@/tests/helpers/backend";
import { fakeNearAi } from "@/tests/helpers/nearai";

const chain = vi.hoisted(() => ({ balanceOf: vi.fn(), commitHand: vi.fn(), settleHand: vi.fn(), houseBalance: vi.fn() }));
vi.mock("@/lib/server/near", async (orig) => ({ ...(await orig<object>()), ...chain }));

const ME = "00000000-0000-4000-8000-00000000000a";
const params = getPreset("shark").params!;
const cfg = {
  tableId: "back-room",
  params,
  runId: "ab12cd34",
  limits: { stopLoss: 1000, takeProfit: 1000, maxHands: 2 },
  stack: 50,
  hands: 0,
  net: 0,
};
let backend: ReturnType<typeof useFakeBackend>;
type Mod = typeof import("@/lib/server/autoplay");
let ap: Mod;

const fakeBackend = useFakeBackend; // a plain helper, not a React hook
const boot = async (nearAi: typeof fetch = fakeNearAi({ action: "call", reason: "ok" })) => {
  backend = fakeBackend(nearAi);
  backend.seedSession(ME, "did:privy:me", "ame.op.testnet");
  ap = await import("@/lib/server/autoplay");
  ap.resetAutoplayForTests();
};
const run = async (c = cfg) => {
  await ap.startAutoplay(ME, c);
  await ap.loopOf(ME);
  return ap.getAutoplay(ME);
};

beforeEach(async () => {
  vi.stubEnv("NEAR_AI_API_KEY", "test-key");
  vi.stubEnv("NEAR_CONTRACT_ID", "poker.testnet");
  chain.balanceOf.mockReset().mockResolvedValue(50);
  chain.commitHand.mockReset().mockResolvedValue("COMMIT_TX");
  chain.settleHand.mockReset().mockResolvedValue("SETTLE_TX");
  chain.houseBalance.mockReset().mockResolvedValue(10000);
  await boot();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("server autoplay", () => {
  it("plays hands until max hands, then turns itself off and says why", async () => {
    const s = await run();
    expect(chain.settleHand).toHaveBeenCalledTimes(2);
    expect(s.on).toBe(false);
    expect(s.autoplay).toMatchObject({ hands: 2, stopped: expect.stringMatching(/maximum number of hands/) });
    expect(ap.isRunning(ME)).toBe(false);
  });

  it("keeps playing hand after hand against a real ledger (stake locked at commit, paid at settle)", async () => {
    let bal = 49.4;
    chain.balanceOf.mockImplementation(async () => bal);
    chain.commitHand.mockImplementation(async (_h: string, _a: string, _d: string, _p: string, stake: number) => {
      bal = Math.round((bal - stake) * 100) / 100;
      return "COMMIT_TX";
    });
    chain.settleHand.mockImplementation(async (_h: string, _d: string, _p: string, payout: number) => {
      bal = Math.round((bal + payout) * 100) / 100;
      return "SETTLE_TX";
    });
    const s = await run({ ...cfg, stack: 49.4, limits: { ...cfg.limits, maxHands: 4 } });
    expect(chain.settleHand).toHaveBeenCalledTimes(4);
    expect(s.autoplay).toMatchObject({ hands: 4, stopped: expect.stringMatching(/maximum number of hands/) });
  });

  it("counts a sitting already under way toward its limits", async () => {
    await run({ ...cfg, hands: 2 });
    expect(chain.commitHand).not.toHaveBeenCalled();
  });

  it("stops on the stop loss", async () => {
    const s = await run({ ...cfg, net: -1000 });
    expect(s.autoplay?.stopped).toMatch(/Stop loss/);
  });

  it("a stop request ends it after the current hand", async () => {
    chain.settleHand.mockImplementation(async () => {
      await ap.stopAutoplay(ME);
      return "SETTLE_TX";
    });
    const s = await run({ ...cfg, limits: { ...cfg.limits, maxHands: 50 } });
    expect(chain.settleHand).toHaveBeenCalledTimes(1);
    expect(s).toMatchObject({ on: false, autoplay: { hands: 1, stopped: "Stopped by you." } });
  });

  it.each([
    ["the house is closed", () => chain.houseBalance.mockResolvedValue(0), /Table closed/],
    ["the agent is out of chips", () => chain.balanceOf.mockResolvedValue(0), /out of chips/],
  ])("stops when %s", async (_, arrange, why) => {
    arrange();
    const s = await run();
    expect(chain.commitHand).not.toHaveBeenCalled();
    expect(s).toMatchObject({ on: false, autoplay: { stopped: expect.stringMatching(why) } });
  });

  it("stops when NEAR AI is down — never plays on with a stand-in", async () => {
    vi.unstubAllGlobals();
    vi.resetModules();
    await boot(vi.fn<typeof fetch>(async () => new Response("down", { status: 503 })));
    const s = await run();
    expect(chain.settleHand).not.toHaveBeenCalled();
    expect(s.on).toBe(false);
    expect(s.autoplay?.stopped).toBeTruthy();
  });

  it("resumes after a restart from the persisted flag, finishing its own committed hand first", async () => {
    // A hand committed by the loop, then the process died before the reveal.
    const realHand = await import("@/lib/server/realHand");
    const deals = await import("@/lib/server/deals");
    const { commitment, newSeed } = await import("@/lib/poker/fairness");
    const { handId } = await deals.createDeal(ME);
    const deal = (await deals.takeSeed(handId, ME))!;
    const seed = newSeed();
    const playerCommitment = await commitment(seed);
    const req = { ...cfg, handId, button: 0 as const, playerCommitment };
    await realHand.commitReal({ sessionId: ME, agent: "ame.op.testnet", deal, playerCommitment, req, autoSeed: seed, tableId: cfg.tableId, stack: 50, handId });
    await backend.fake(`http://backend.test/sessions/${ME}/autoplay`, {
      method: "PUT",
      headers: { Authorization: "Bearer test-token" },
      body: JSON.stringify({ on: true, autoplay: { ...cfg, limits: { ...cfg.limits, maxHands: 1 }, startedAt: 0 } }),
    });

    vi.resetModules(); // restart
    const fresh: Mod = await import("@/lib/server/autoplay");
    await fresh.resumeAll();
    await fresh.loopOf(ME);
    expect(chain.settleHand).toHaveBeenCalledTimes(1);
    expect(chain.settleHand.mock.calls[0][0]).toBe(handId); // the stuck hand, with its committed seed
    expect(chain.settleHand.mock.calls[0][2]).toBe(seed);
    expect((await fresh.getAutoplay(ME)).autoplay).toMatchObject({ hands: 1 });
  });
});
