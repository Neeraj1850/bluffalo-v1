import { describe, expect, it } from "vitest";
import { ACTIVE_MS, claimTable, leaveTable } from "@/lib/server/activeTable";

describe("one table at a time", () => {
  it("lets a player keep dealing at the same table", () => {
    expect(claimTable("s1", "kitchen", 0)).toBeNull();
    expect(claimTable("s1", "kitchen", 10)).toBeNull();
  });

  it("refuses another table while the first is still in play", () => {
    claimTable("s2", "kitchen", 0);
    expect(claimTable("s2", "back-room", ACTIVE_MS - 1)).toBe("kitchen");
  });

  it("frees the table once play has gone quiet, or the player left", () => {
    claimTable("s3", "kitchen", 0);
    expect(claimTable("s3", "back-room", ACTIVE_MS)).toBeNull();
    claimTable("s4", "kitchen", 0);
    leaveTable("s4");
    expect(claimTable("s4", "back-room", 1)).toBeNull();
  });

  it("keeps players apart", () => {
    claimTable("a", "kitchen", 0);
    expect(claimTable("b", "back-room", 1)).toBeNull();
  });
});
