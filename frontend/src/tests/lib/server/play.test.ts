import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as hands } from "@/app/api/hands/route";
import { POST } from "@/app/api/play/route";
import { getPreset } from "@/lib/data/strategy";
import { commitment, verifyDeal } from "@/lib/poker/fairness";
import { createDeal } from "@/lib/server/deals";
import { parsePlayRequest, playHand } from "@/lib/server/play";
import { SESSION_COOKIE } from "@/lib/server/sessions";
import { useTestDb } from "@/tests/helpers/db";

const params = getPreset("shark").params!;
const valid = { handId: "0123abcd", tableId: "back-room", params, stack: 50, button: 0 as const };
const ME = "00000000-0000-4000-8000-00000000000a";
const OTHER = "00000000-0000-4000-8000-00000000000b";
const headers = (id = ME) => ({ cookie: `${SESSION_COOKIE}=${id}` });
const post = (body: unknown, id = ME) =>
  POST(new Request("http://x/api/play", { method: "POST", headers: headers(id), body: JSON.stringify(body) }));
const archive = async (id = ME) => (await (await hands(new Request("http://x/api/hands", { headers: headers(id) }))).json()).hands;

// No key: every decision comes from the heuristic, so tests never hit the network.
beforeEach(async () => {
  vi.stubEnv("GROQ_API_KEY", "");
  const pg = await useTestDb();
  await pg.query("insert into sessions (id) values ($1), ($2)", [ME, OTHER]);
});
afterEach(() => vi.unstubAllEnvs());

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
    vi.stubEnv("GROQ_API_KEY", "test-key");
    const f = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '{"action":"fold"}' } }] }), { status: 200 }),
    );
    const deal = { seed: "00112233445566778899aabbccddeeff", commitment: "c" };
    await playHand({ ...valid, tableId: "kitchen" }, deal, { fetch: f });
    const models = f.mock.calls.map(([, init]) => JSON.parse(init.body).model);
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

  it("refuses to play a hand twice", async () => {
    const deal = await createDeal(ME);
    await post({ ...valid, handId: deal.handId });
    expect((await post({ ...valid, handId: deal.handId })).status).toBe(404);
  });

  it("rejects invalid input with 400", async () => {
    expect((await post({ ...valid, stack: "lots" })).status).toBe(400);
  });
});
