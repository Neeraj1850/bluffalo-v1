import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/agent/route";
import { inFlight } from "@/lib/server/inFlight";
import { SESSION_COOKIE, setSessionAgent } from "@/lib/server/sessions";
import { useFakeBackend } from "@/tests/helpers/backend";

const chain = vi.hoisted(() => ({ balanceOf: vi.fn() }));
vi.mock("@/lib/server/near", async (orig) => ({ ...(await orig<object>()), ...chain }));

const ME = "00000000-0000-4000-8000-00000000000a";
const AGENT = "a1b2c3d4.op.testnet";
const get = () => GET(new Request("http://x/api/agent", { headers: { cookie: `${SESSION_COOKIE}=${ME}` } }));

beforeEach(async () => {
  const { seedSession } = useFakeBackend();
  seedSession(ME, "did:privy:me");
  await setSessionAgent(ME, AGENT, "ed25519:k");
  chain.balanceOf.mockReset().mockResolvedValue(0);
  inFlight.clear();
});

describe("GET /api/agent", () => {
  it("reports a hand in progress while the stack is locked", async () => {
    inFlight.add(AGENT);
    expect(await (await get()).json()).toEqual({ account: AGENT, balance: 0, inHand: true });
  });
  it("reports inHand false once settled", async () => {
    chain.balanceOf.mockResolvedValue(40);
    expect(await (await get()).json()).toEqual({ account: AGENT, balance: 40, inHand: false });
  });
});
