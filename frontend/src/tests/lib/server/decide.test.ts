import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cards } from "@/lib/cards";
import { getPreset } from "@/lib/data/strategy";
import { newHand } from "@/lib/poker/game";
import { decide, decideHouse, ServiceDownError } from "@/lib/server/decide";
import { seatView } from "@/lib/poker/agent";
import { MODELS } from "@/lib/server/nearai";
import { fakeNearAi } from "@/tests/helpers/nearai";

const state = newHand({
  deck: cards("Qs", "9h", "Qd", "8s", "9c", "4h", "2s", "Kd", "4c"),
  stacks: [50, 50],
  blinds: { small: 0.5, big: 1 },
  button: 0,
});
const shark = getPreset("shark").params!;
const reply = fakeNearAi;

describe("decide", () => {
  beforeEach(() => vi.stubEnv("NEAR_AI_API_KEY", "test-key"));
  afterEach(() => vi.unstubAllEnvs());

  it("uses the model's legal move", async () => {
    const d = await decide(state, shark, { fetch: reply({ action: "call", reason: "Cheap to see a flop." }) });
    expect(d).toEqual({ action: { type: "call" }, reason: "Cheap to see a flop.", source: "nearai", requestHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it("uses the agent model for the player and the house model for the house", async () => {
    const f = reply({ action: "call" });
    await decide(state, shark, { fetch: f });
    await decide(state, null, { fetch: f });
    const models = f.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).model);
    expect(models).toEqual([MODELS.agent, MODELS.house]);
  });

  it("falls back to the heuristic on an illegal move", async () => {
    const d = await decide(state, shark, { fetch: reply({ action: "check" }) });
    expect(d.source).toBe("heuristic");
  });

  it.each([
    ["the rate limit is hit", 429],
    ["NEAR AI has an outage", 503],
    ["the key is rejected", 401],
  ])("reports the service down when %s", async (_, status) => {
    // Fresh response per call, and fake timers so retry backoff doesn't wait in real time.
    vi.useFakeTimers();
    const f = vi.fn(async () => new Response("{}", { status }));
    const result = expect(decide(state, shark, { fetch: f, rand: () => 0 })).rejects.toBeInstanceOf(ServiceDownError);
    await vi.runAllTimersAsync();
    await result;
    vi.useRealTimers();
  });

  it("reports the service down when NEAR AI can't be reached", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(decide(state, shark, { fetch: f })).rejects.toThrow("service is down");
  });

  it("uses the heuristic only for a garbled reply", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), { status: 200 }));
    expect((await decide(state, shark, { fetch: f })).source).toBe("heuristic");
  });

  it("skips the model when asked to play offline", async () => {
    const f = vi.fn();
    expect((await decide(state, null, { fetch: f, offline: true })).source).toBe("heuristic");
    expect(f).not.toHaveBeenCalled();
  });

  it("reports the service down without a key, without calling out", async () => {
    vi.stubEnv("NEAR_AI_API_KEY", "");
    const f = vi.fn();
    await expect(decide(state, shark, { fetch: f })).rejects.toBeInstanceOf(ServiceDownError);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("decideHouse", () => {
  afterEach(() => vi.unstubAllEnvs());
  const v = seatView(state, 1);

  it("plays the baseline when NEAR AI is unavailable (house only)", async () => {
    vi.stubEnv("NEAR_AI_API_KEY", "");
    expect((await decide(state, null)).source).toBe("baseline");
    vi.stubEnv("NEAR_AI_API_KEY", "k");
    const f = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    expect((await decideHouse(v, { fetch: f })).source).toBe("baseline");
  });

  it("sends computed stats to the model and clamps absurd moves", async () => {
    vi.stubEnv("NEAR_AI_API_KEY", "k");
    const f = fakeNearAi({ action: "raise", amount: 50, reason: "shove trash" });
    const d = await decideHouse({ ...v, hole: cards("7d", "2c") }, { fetch: f });
    expect(d.source).toBe("baseline");
    const body = JSON.parse(String(f.mock.calls[0][1]?.body));
    expect(body.messages[1].content).toMatch(/Equity vs a random hand/);
    expect(body.messages[1].content).toMatch(/Stack-to-pot/);
  });

  it("keeps the exact request body it sent, with its sha256, even when overruled", async () => {
    vi.stubEnv("NEAR_AI_API_KEY", "k");
    const f = fakeNearAi({ action: "raise", amount: 50, reason: "shove trash" });
    const d = await decideHouse({ ...v, hole: cards("7d", "2c") }, { fetch: f });
    expect(d.request).toBe(String(f.mock.calls[0][1]?.body));
    expect(d.requestHash).toBe(createHash("sha256").update(d.request!).digest("hex"));
  });
});
