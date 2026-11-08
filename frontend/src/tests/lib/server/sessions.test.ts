import { beforeEach, describe, expect, it } from "vitest";
import { GET, PUT } from "@/app/api/session/route";
import { parseState, SESSION_COOKIE } from "@/lib/server/sessions";
import { useTestDb } from "@/tests/helpers/db";

const req = (method: string, cookie?: string, body?: unknown) =>
  new Request("http://x/api/session", {
    method,
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const cookieOf = (res: Response) => res.headers.get("set-cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];

beforeEach(async () => {
  await useTestDb();
});

describe("session routes", () => {
  it("creates a session with an httpOnly cookie on first visit", async () => {
    const res = await GET(req("GET"));
    expect(await res.json()).toEqual({ state: {} });
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(cookieOf(res)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("saves and loads state for the same cookie", async () => {
    const id = cookieOf(await GET(req("GET")))!;
    await PUT(req("PUT", id, { tableId: "vault", balance: 80 }));
    const res = await GET(req("GET", id));
    expect(await res.json()).toEqual({ state: { tableId: "vault", balance: 80 } });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("keeps sessions apart", async () => {
    const a = cookieOf(await GET(req("GET")))!;
    const b = cookieOf(await GET(req("GET")))!;
    await PUT(req("PUT", a, { tableId: "vault" }));
    expect(await (await GET(req("GET", b))).json()).toEqual({ state: {} });
  });

  it("starts fresh for an unknown or malformed cookie", async () => {
    for (const bad of ["00000000-0000-0000-0000-000000000000", "'; drop table sessions;--"]) {
      const res = await GET(req("GET", bad));
      expect(await res.json()).toEqual({ state: {} });
      expect(cookieOf(res)).not.toBe(bad);
    }
  });

  it("rejects bad state with 400", async () => {
    const id = cookieOf(await GET(req("GET")))!;
    expect((await PUT(req("PUT", id, [1, 2]))).status).toBe(400);
  });
});

describe("parseState", () => {
  it("accepts small objects", () => {
    expect(parseState({ a: 1 })).toEqual({ a: 1 });
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["a string", "x"],
    ["anything over 16 kB", { blob: "x".repeat(20_000) }],
  ])("rejects %s", (_, body) => {
    expect(typeof parseState(body)).toBe("string");
  });
});
