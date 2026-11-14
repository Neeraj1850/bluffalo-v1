import { describe, expect, it, vi } from "vitest";

vi.mock("@privy-io/react-auth", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

const { isGuestPath } = await import("@/lib/auth");

describe("isGuestPath", () => {
  it("lets guests practice and browse the market", () => {
    for (const p of ["/strategy/test", "/market", "/market/sim", "/market/s5ba947d2"]) expect(isGuestPath(p)).toBe(true);
  });

  it("keeps money screens behind sign-in", () => {
    for (const p of ["/wallet", "/deploy", "/game", "/profile", "/strategy", "/marketing"]) expect(isGuestPath(p)).toBe(false);
  });
});
