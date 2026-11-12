import { describe, expect, it } from "vitest";
import { activeNavKey, BOTTOM_NAV_ITEMS, NAV_ITEMS, showsBottomNav } from "@/components/nav/navItems";

describe("nav", () => {
  it("puts Market after Strategy and matches its sub-routes", () => {
    expect(NAV_ITEMS.map((i) => i.key).slice(0, 3)).toEqual(["lobby", "strategy", "market"]);
    expect(activeNavKey("/market")).toBe("market");
    expect(activeNavKey("/market/sim")).toBe("market");
    expect(activeNavKey("/market/shark")).toBe("market");
  });

  it("fits five items in the mobile bar", () => {
    expect(BOTTOM_NAV_ITEMS.map((i) => i.key)).toEqual(["lobby", "strategy", "market", "history", "profile"]);
  });

  it("shows the bar on the market but not the focused sim", () => {
    expect(showsBottomNav("/market")).toBe(true);
    expect(showsBottomNav("/market/shark")).toBe(true);
    expect(showsBottomNav("/market/sim")).toBe(false);
    expect(showsBottomNav("/game")).toBe(false);
  });
});
