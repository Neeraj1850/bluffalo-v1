import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/agent/deploy/route";
import { ChainError } from "@/lib/server/near";
import { SESSION_COOKIE, sessionAgent, sessionAgentKey } from "@/lib/server/sessions";
import { useFakeBackend } from "@/tests/helpers/backend";

const chain = vi.hoisted(() => ({ createAgentAccount: vi.fn(), depositFor: vi.fn() }));
vi.mock("@/lib/server/near", async (orig) => ({ ...(await orig<object>()), ...chain }));

const ME = "00000000-0000-4000-8000-00000000000a";
const GUEST = "00000000-0000-4000-8000-00000000000c";
const deploy = (body: unknown, id = ME) =>
  POST(new Request("http://x/api/agent/deploy", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${id}` }, body: JSON.stringify(body) }));

beforeEach(() => {
  const { seedSession } = useFakeBackend();
  seedSession(ME, "did:privy:me");
  seedSession(GUEST);
  chain.createAgentAccount.mockReset().mockResolvedValue({ accountId: "a1b2c3d4.op.testnet", privateKey: "ed25519:agentkey" });
  chain.depositFor.mockReset().mockResolvedValue("DEPOSIT_TX");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/agent/deploy", () => {
  it("creates a funded agent account and remembers it for the session", async () => {
    const res = await deploy({ tableId: "back-room" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ agentAccount: "a1b2c3d4.op.testnet", depositTx: "DEPOSIT_TX" });
    expect(chain.depositFor).toHaveBeenCalledWith("a1b2c3d4.op.testnet", 50); // the table's buy-in, set by the server
    expect(await sessionAgent(ME)).toBe("a1b2c3d4.op.testnet");
    expect(await sessionAgentKey(ME)).toBe("ed25519:agentkey");
  });

  it("never returns the agent's key to the browser", async () => {
    const body = JSON.stringify(await (await deploy({ tableId: "back-room" })).json());
    expect(body).not.toContain("agentkey");
  });

  it("requires sign-in", async () => {
    expect((await deploy({ tableId: "back-room" }, GUEST)).status).toBe(401);
    expect(chain.createAgentAccount).not.toHaveBeenCalled();
  });

  it.each([["the practice table", "kitchen"], ["an unknown table", "casino"]])("refuses %s", async (_, tableId) => {
    expect((await deploy({ tableId })).status).toBe(400);
  });

  it("answers 503 chain_down when testnet fails, and stores nothing", async () => {
    chain.depositFor.mockRejectedValueOnce(new ChainError());
    const res = await deploy({ tableId: "back-room" });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("chain_down");
    expect(await sessionAgent(ME)).toBeNull();
  });
});
