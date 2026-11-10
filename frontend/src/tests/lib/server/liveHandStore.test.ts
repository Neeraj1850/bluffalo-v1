import { afterEach, describe, expect, it, vi } from "vitest";
import { freshDeck } from "@/lib/poker/deck";
import { newHand } from "@/lib/poker/game";
import type { LiveHandRecord } from "@/lib/server/liveHand";
import { backendStore } from "@/lib/server/liveHandStore";
import { useFakeBackend } from "@/tests/helpers/backend";

function record(sessionId: string, over: Partial<LiveHandRecord> = {}): LiveHandRecord {
  return {
    handId: "0123abcd",
    sessionId,
    tableName: "the back room",
    state: newHand({ deck: freshDeck(), stacks: [100, 100], blinds: { small: 0.5, big: 1 }, button: 0 }),
    reasons: [],
    deal: { seed: "a".repeat(32), commitment: "b".repeat(64), playerSeed: "c".repeat(32) },
    status: "active",
    updatedAt: 1000,
    ...over,
  };
}

describe("backendStore", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("round-trips a record and returns null for an unknown hand", async () => {
    const { seedSession } = useFakeBackend();
    const sid = crypto.randomUUID();
    seedSession(sid);
    const store = backendStore();

    expect(await store.get("0123abcd")).toBeNull();
    const rec = record(sid);
    await store.put(rec);
    const got = await store.get("0123abcd");
    expect(got?.handId).toBe("0123abcd");
    expect(got?.state.toAct).toBe(0);
  });

  it("stale() returns only old, active hands waiting on the agent", async () => {
    const { seedSession } = useFakeBackend();
    const sid = crypto.randomUUID();
    seedSession(sid);
    const store = backendStore();

    await store.put(record(sid, { handId: "0000aaaa", updatedAt: 500 })); // stale
    await store.put(record(sid, { handId: "0000bbbb", updatedAt: 5000 })); // too recent
    await store.put(record(sid, { handId: "0000dddd", updatedAt: 500, status: "settled" })); // done

    const stale = await store.stale(1000);
    expect(stale.map((r) => r.handId)).toEqual(["0000aaaa"]);
  });
});
