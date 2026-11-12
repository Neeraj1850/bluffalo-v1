import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

describe("ConnectActions", () => {
  it("offers free practice without sign-in", async () => {
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "");
    const { ConnectActions } = await import("@/components/connect/ConnectActions");
    const html = renderToStaticMarkup(createElement(ConnectActions));
    expect(html).toContain('href="/strategy/test"');
    expect(html).toContain("Try it free");
    vi.unstubAllEnvs();
  });
});
