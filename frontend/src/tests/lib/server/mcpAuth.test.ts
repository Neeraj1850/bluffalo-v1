import { afterEach, describe, expect, it, vi } from "vitest";
import { authFromRequest } from "@/lib/server/mcpAuth";
import { setSessionAgent } from "@/lib/server/sessions";
import { useFakeBackend } from "@/tests/helpers/backend";

const TOKEN = "a".repeat(64);
const KEY = "ed25519:" + "3".repeat(64);
const req = (auth?: string) => new Request("https://x/api/mcp", { headers: auth ? { authorization: auth } : {} });

describe("MCP auth", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves a Bearer token to its deployed agent", async () => {
    const { seedSession } = useFakeBackend();
    const sid = crypto.randomUUID();
    seedSession(sid);
    await setSessionAgent(sid, "a1.op.testnet", KEY, TOKEN);

    const auth = await authFromRequest(req(`Bearer ${TOKEN}`));
    expect(auth).toEqual({ sessionId: sid, agent: "a1.op.testnet", agentKey: KEY });
  });

  it("rejects a missing, malformed, or unknown token", async () => {
    useFakeBackend();
    expect(await authFromRequest(req())).toBeNull();
    expect(await authFromRequest(req("Bearer not-a-token"))).toBeNull();
    expect(await authFromRequest(req(`Bearer ${"f".repeat(64)}`))).toBeNull();
  });

  it("rejects a token whose session has no deployed agent", async () => {
    const { seedSession } = useFakeBackend();
    const sid = crypto.randomUUID();
    seedSession(sid);
    // Token stored but no agent account/key yet.
    await setSessionAgent(sid, "", "", TOKEN);
    expect(await authFromRequest(req(`Bearer ${TOKEN}`))).toBeNull();
  });
});
