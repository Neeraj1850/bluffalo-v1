import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/deal/route";
import { commitment } from "@/lib/poker/fairness";
import { createDeal, takeSeed } from "@/lib/server/deals";
import { useTestDb } from "@/tests/helpers/db";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
let pg: PGlite;

beforeEach(async () => {
  pg = await useTestDb();
  await pg.query("insert into sessions (id) values ($1), ($2)", [A, B]);
});

describe("deal store", () => {
  it("commits to a seed it reveals later", async () => {
    const deal = await createDeal(A);
    const revealed = await takeSeed(deal.handId, A);
    expect(revealed).not.toBeNull();
    expect(await commitment(revealed!.seed)).toBe(deal.commitment);
  });

  it("reveals each seed only once", async () => {
    const { handId } = await createDeal(A);
    expect(await takeSeed(handId, A)).not.toBeNull();
    expect(await takeSeed(handId, A)).toBeNull();
  });

  it("never hands a seed to another session", async () => {
    const { handId } = await createDeal(A);
    expect(await takeSeed(handId, B)).toBeNull();
    expect(await takeSeed(handId, A)).not.toBeNull();
  });

  it("returns null for unknown hands", async () => {
    expect(await takeSeed("nope", A)).toBeNull();
  });

  it("expires deals that were never played", async () => {
    const { handId } = await createDeal(A);
    await pg.query("update deals set created_at = now() - interval '11 minutes' where hand_id = $1", [handId]);
    expect(await takeSeed(handId, A)).toBeNull();
  });
});

describe("POST /api/deal", () => {
  it("returns a hand id and commitment but never the seed", async () => {
    const body = await (await POST(new Request("http://x/api/deal", { method: "POST" }))).json();
    expect(Object.keys(body).sort()).toEqual(["commitment", "handId"]);
    expect(body.commitment).toMatch(/^[0-9a-f]{64}$/);
  });
});
