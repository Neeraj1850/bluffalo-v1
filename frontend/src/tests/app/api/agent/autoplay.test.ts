import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/agent/autoplay/route";
import { getPreset } from "@/lib/data/strategy";
import { loopOf, resetAutoplayForTests } from "@/lib/server/autoplay";
import { SESSION_COOKIE } from "@/lib/server/sessions";
import { useFakeBackend } from "@/tests/helpers/backend";

// The chain refuses every hand (table closed), so a started loop stops straight away.
const chain = vi.hoisted(() => ({ balanceOf: vi.fn(), houseBalance: vi.fn() }));
vi.mock("@/lib/server/near", async (orig) => ({ ...(await orig<object>()), ...chain }));

const ME = "00000000-0000-4000-8000-00000000000a";
const GUEST = "00000000-0000-4000-8000-00000000000b";
const headers = (id = ME) => ({ cookie: `${SESSION_COOKIE}=${id}` });
const post = (body: unknown, id = ME) => POST(new Request("http://x/api/agent/autoplay", { method: "POST", headers: headers(id), body: JSON.stringify(body) }));
const get = async () => (await GET(new Request("http://x/api/agent/autoplay", { headers: headers() }))).json();
const start = {
  on: true,
  tableId: "back-room",
  params: getPreset("shark").params,
  runId: "ab12cd34",
  limits: { stopLoss: 25, takeProfit: 60, maxHands: 100 },
  stack: 50,
};

beforeEach(() => {
  const b = useFakeBackend();
  b.seedSession(ME, "did:privy:me", "ame.op.testnet");
  b.seedSession(GUEST);
  chain.balanceOf.mockResolvedValue(50);
  chain.houseBalance.mockResolvedValue(0);
  resetAutoplayForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("/api/agent/autoplay", () => {
  it("is off by default", async () => {
    expect(await get()).toMatchObject({ on: false, running: false, autoplay: null });
  });

  it("needs sign-in and valid settings", async () => {
    expect((await post(start, GUEST)).status).toBe(401);
    expect((await post({ ...start, tableId: "kitchen" })).status).toBe(400); // practice table
    expect((await post({ ...start, limits: { stopLoss: -1 } })).status).toBe(400);
    expect((await post({ on: "yes" })).status).toBe(400);
  });

  it("starts the server loop, which stops itself and says why", async () => {
    expect(await (await post(start)).json()).toEqual({ on: true });
    await loopOf(ME);
    expect(await get()).toMatchObject({ on: false, autoplay: { stopped: expect.stringMatching(/Table closed/) } });
  });

  it("a stop request turns it off", async () => {
    await post(start);
    expect(await (await post({ on: false })).json()).toEqual({ on: false });
    await loopOf(ME);
    expect(await get()).toMatchObject({ on: false, autoplay: { stopped: "Stopped by you." } });
  });
});
