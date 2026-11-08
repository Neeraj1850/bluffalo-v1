import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cards } from "@/lib/cards";
import { getPreset } from "@/lib/data/strategy";
import { newHand } from "@/lib/poker/game";
import { decide } from "@/lib/server/decide";

const state = newHand({
  deck: cards("Qs", "9h", "Qd", "8s", "9c", "4h", "2s", "Kd", "4c"),
  stacks: [50, 50],
  blinds: { small: 0.5, big: 1 },
  button: 0,
});
const shark = getPreset("shark").params!;
const reply = (content: unknown) =>
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 }),
  );

describe("decide", () => {
  beforeEach(() => vi.stubEnv("GROQ_API_KEY", "test-key"));
  afterEach(() => vi.unstubAllEnvs());

  it("uses the model's legal move", async () => {
    const d = await decide(state, shark, { fetch: reply({ action: "call", reason: "Cheap to see a flop." }) });
    expect(d).toEqual({ action: { type: "call" }, reason: "Cheap to see a flop.", source: "groq" });
  });

  it("uses the agent model for the player and the house model for the house", async () => {
    const f = reply({ action: "call" });
    await decide(state, shark, { fetch: f });
    await decide(state, null, { fetch: f });
    const models = f.mock.calls.map(([, init]) => JSON.parse(init.body).model);
    expect(models).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
  });

  it("falls back to the heuristic on an illegal move", async () => {
    const d = await decide(state, shark, { fetch: reply({ action: "check" }) });
    expect(d.source).toBe("heuristic");
  });

  it("falls back to the heuristic when Groq fails", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 400 }));
    expect((await decide(state, shark, { fetch: f })).source).toBe("heuristic");
  });

  it("skips the model when asked to play offline", async () => {
    const f = vi.fn();
    expect((await decide(state, null, { fetch: f, offline: true })).source).toBe("heuristic");
    expect(f).not.toHaveBeenCalled();
  });

  it("skips the network entirely without a key", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const f = vi.fn();
    expect((await decide(state, shark, { fetch: f })).source).toBe("heuristic");
    expect(f).not.toHaveBeenCalled();
  });
});
