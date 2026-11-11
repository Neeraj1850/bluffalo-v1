import { createHash } from "node:crypto";
import { Wallet } from "ethers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyModel } from "@/lib/server/nearaiAttest";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const MODEL = "test-model";
const wallet = new Wallet(`0x${"1".repeat(64)}`); // deterministic signer

/**
 * A NEAR AI Cloud stand-in: the attestation report vouches for `signerAddr`,
 * the completion echoes an id, and the signature signs `model:reqHash:respHash`
 * with `signWith`. Override those to simulate a non-attested or forged signer.
 */
type Signer = { address: string; signMessage(m: string): Promise<string> };
function fakeCloud({ signerAddr = wallet.address, signWith = wallet as Signer }: { signerAddr?: string; signWith?: Signer } = {}) {
  let reqBody = "";
  let respText = "";
  return vi.fn<typeof fetch>(async (url, init) => {
    const u = String(url);
    if (u.includes("/attestation/report")) return json({ model_attestations: [{ signing_address: signerAddr }] });
    if (u.includes("/chat/completions")) {
      reqBody = String(init?.body);
      respText = JSON.stringify({ id: "chat-1", choices: [{ message: { content: "x" } }] });
      return new Response(respText, { status: 200 });
    }
    if (u.includes("/signature/chat-1")) {
      const text = `${MODEL}:${sha(reqBody)}:${sha(respText)}`;
      const signature = await signWith.signMessage(text);
      return json({ text, signature, signing_address: signWith.address, signature_kind: "provider_tee" });
    }
    throw new Error(`unexpected ${u}`);
  });
}

const noSleep = async () => {};

describe("verifyModel", () => {
  beforeEach(() => vi.stubEnv("NEAR_AI_API_KEY", "test-key"));
  afterEach(() => vi.unstubAllEnvs());

  it("verifies a completion signed by an attested TEE signer", async () => {
    const att = await verifyModel(MODEL, { fetch: fakeCloud(), sleep: noSleep });
    expect(att.verified).toBe(true);
    expect(att.signer).toBe(wallet.address.toLowerCase());
    expect(att.signatureKind).toBe("provider_tee");
  });

  it("rejects a signer the attestation does not vouch for", async () => {
    const other = Wallet.createRandom();
    const att = await verifyModel(MODEL, { fetch: fakeCloud({ signWith: other }), sleep: noSleep });
    expect(att.verified).toBe(false);
    expect(att.detail).toMatch(/attested/);
  });

  it("rejects when the signed hashes don't match the response", async () => {
    const f: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes("/attestation/report")) return json({ model_attestations: [{ signing_address: wallet.address }] });
      if (u.includes("/chat/completions")) return new Response(JSON.stringify({ id: "chat-1" }), { status: 200 });
      // Sign hashes of the wrong bytes.
      const text = `${MODEL}:${sha("not the request")}:${sha("not the response")}`;
      return json({ text, signature: await wallet.signMessage(text), signing_address: wallet.address, signature_kind: "provider_tee" });
    };
    const att = await verifyModel(MODEL, { fetch: f, sleep: noSleep });
    expect(att.verified).toBe(false);
    expect(att.detail).toMatch(/hashes/);
  });

  it("reports unverified without an API key", async () => {
    vi.stubEnv("NEAR_AI_API_KEY", "");
    const att = await verifyModel(MODEL, { fetch: fakeCloud(), sleep: noSleep });
    expect(att.verified).toBe(false);
    expect(att.detail).toMatch(/NEAR_AI_API_KEY/);
  });
});
