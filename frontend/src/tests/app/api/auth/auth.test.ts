import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as link } from "@/app/api/auth/link/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as getSession, PUT as putSession } from "@/app/api/session/route";
import { SESSION_COOKIE } from "@/lib/server/sessions";
import { useFakeBackend } from "@/tests/helpers/backend";

// Privy's verification is mocked: "good-<user>" tokens are valid for that user.
vi.mock("@/lib/server/privy", () => ({
  verifyPrivyToken: vi.fn(async (t: string) => (t.startsWith("good-") ? `did:privy:${t.slice(5)}` : null)),
}));

const cookieOf = (res: Response) => res.headers.get("set-cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
const req = (url: string, { cookie, token, method = "POST", body }: { cookie?: string; token?: string; method?: string; body?: unknown } = {}) =>
  new Request(`http://x${url}`, {
    method,
    headers: {
      ...(cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const visit = async () => cookieOf(await getSession(req("/api/session", { method: "GET" })))!;

beforeEach(() => {
  useFakeBackend();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/auth/link", () => {
  it("rejects a missing or invalid token", async () => {
    expect((await link(req("/api/auth/link"))).status).toBe(401);
    expect((await link(req("/api/auth/link", { token: "forged" }))).status).toBe(401);
  });

  it("keeps the current session for a first-time user", async () => {
    const phone = await visit();
    const res = await link(req("/api/auth/link", { cookie: phone, token: "good-alice" }));
    expect(res.status).toBe(200);
    expect(cookieOf(res)).toBe(phone);
  });

  it("switches another device to the user's existing session and its setup", async () => {
    const phone = await visit();
    await putSession(req("/api/session", { cookie: phone, method: "PUT", body: { tableId: "vault" } }));
    await link(req("/api/auth/link", { cookie: phone, token: "good-alice" }));

    const laptop = await visit();
    const res = await link(req("/api/auth/link", { cookie: laptop, token: "good-alice" }));
    expect(cookieOf(res)).toBe(phone);
    expect(await res.json()).toEqual({ state: { tableId: "vault" } });
  });
});

describe("POST /api/auth/logout", () => {
  it("hands out a fresh session", async () => {
    const phone = await visit();
    const res = await logout();
    expect(cookieOf(res)).toBeTruthy();
    expect(cookieOf(res)).not.toBe(phone);
  });
});
