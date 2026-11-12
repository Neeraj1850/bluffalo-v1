import { afterEach, describe, expect, it, vi } from "vitest";
import { namer } from "@/lib/server/market";

afterEach(() => vi.unstubAllEnvs());

describe("namer", () => {
  it("names NPCs, the caller as you, and shortens long accounts", () => {
    vi.stubEnv("NEAR_AI_API_KEY", "");
    vi.stubEnv("NPC_BOOKIE", "bookie.npoker-op-43b602.testnet:ed25519:abc");
    const n = namer("me.testnet");
    expect(n.name("bookie.npoker-op-43b602.testnet")).toBe("Bookie");
    expect(n.name("me.testnet")).toBe("you");
    expect(n.name("a".repeat(64))).toBe("aaaaaa…aaaa");
    expect(n.name("someone-with-a-very-long-name.testnet").length).toBeLessThan(24);
    vi.stubEnv("NEAR_OPERATOR_ID", "npoker-op-43b602.testnet");
    expect(namer(null).name("ava.npoker-op-43b602.testnet")).toBe("ava");
  });
});
