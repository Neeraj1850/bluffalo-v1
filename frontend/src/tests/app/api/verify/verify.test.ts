import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/verify/route";

const attest = vi.hoisted(() => ({ verifyChat: vi.fn(), verifyModel: vi.fn() }));
vi.mock("@/lib/server/nearaiAttest", async (orig) => ({ ...(await orig<object>()), ...attest }));

const get = async (q = "") => (await GET(new Request(`http://x/api/verify${q}`))).json();

describe("GET /api/verify", () => {
  it("checks the hand's own decisions, and verifies only if every one is attested", async () => {
    attest.verifyChat.mockImplementation(async (id: string) => ({ chatId: id, verified: id !== "chat-bad", signer: "0xabc", verifyUrl: "u" }));
    expect(await get("?chats=chat-aaaaaa,chat-bbbbbb")).toMatchObject({ verified: true, decisions: 2, verifiedDecisions: 2 });
    expect(attest.verifyChat).toHaveBeenCalledWith("chat-aaaaaa", expect.any(String));
    const mixed = await get("?chats=chat-aaaaaa,chat-bad");
    expect(mixed).toMatchObject({ verified: false, decisions: 2, verifiedDecisions: 1 });
    expect(mixed.detail).toContain("chat-bad");
  });

  it("falls back to a live model check when there are no decisions to check", async () => {
    attest.verifyModel.mockResolvedValueOnce({ verified: true, model: "m", verifyUrl: "u" });
    expect(await get()).toMatchObject({ verified: true });
    expect(attest.verifyModel).toHaveBeenCalled();
  });

  it("ignores malformed ids", async () => {
    attest.verifyModel.mockResolvedValueOnce({ verified: true, model: "m", verifyUrl: "u" });
    attest.verifyChat.mockClear();
    await get("?chats=../../etc,%20");
    expect(attest.verifyChat).not.toHaveBeenCalled();
  });
});
