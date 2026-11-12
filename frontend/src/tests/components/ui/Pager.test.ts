import { describe, expect, it } from "vitest";
import { paginate } from "@/components/ui/Pager";

describe("paginate", () => {
  const list = Array.from({ length: 23 }, (_, i) => i);
  it("cuts a list into pages of a fixed size", () => {
    expect(paginate(list, 1, 10)).toEqual({ items: list.slice(0, 10), page: 1, pages: 3 });
    expect(paginate(list, 3, 10).items).toEqual([20, 21, 22]);
  });
  it("clamps a page that no longer exists (e.g. after filtering)", () => {
    expect(paginate(list, 9, 10).page).toBe(3);
    expect(paginate([], 2, 10)).toEqual({ items: [], page: 1, pages: 1 });
  });
});
