import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("answers ok without touching the backend or the chain", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
