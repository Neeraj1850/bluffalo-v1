import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPrivyToken } from "@/lib/server/privy";

const verifyAccessToken = vi.fn();
const ctorArgs = vi.fn();
vi.mock("@privy-io/node", () => ({
  PrivyClient: class {
    constructor(opts: unknown) {
      ctorArgs(opts);
    }
    utils = () => ({ auth: () => ({ verifyAccessToken }) });
  },
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "app");
  vi.stubEnv("PRIVY_APP_SECRET", "secret");
});
afterEach(() => vi.unstubAllEnvs());

describe("verifyPrivyToken", () => {
  it("returns the user id from a valid token", async () => {
    verifyAccessToken.mockResolvedValueOnce({ user_id: "did:privy:alice" });
    expect(await verifyPrivyToken("t")).toBe("did:privy:alice");
    expect(verifyAccessToken).toHaveBeenCalledWith("t");
  });

  it("returns null for an invalid or expired token", async () => {
    verifyAccessToken.mockRejectedValueOnce(new Error("JWTExpired"));
    expect(await verifyPrivyToken("t")).toBeNull();
  });

  it("refuses to run without Privy credentials", async () => {
    vi.stubEnv("PRIVY_APP_SECRET", "");
    await expect(verifyPrivyToken("t")).rejects.toThrow("PRIVY_APP_SECRET");
  });

  it("verifies locally with PRIVY_VERIFICATION_KEY when set", async () => {
    vi.stubEnv("PRIVY_VERIFICATION_KEY", "-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----");
    verifyAccessToken.mockResolvedValueOnce({ user_id: "did:privy:bob" });
    expect(await verifyPrivyToken("t")).toBe("did:privy:bob");
    expect(ctorArgs).toHaveBeenLastCalledWith(
      expect.objectContaining({ jwtVerificationKey: "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----" }),
    );
  });
});
