import { createHash, randomBytes } from "node:crypto";
import { verifyMessage } from "ethers";

/**
 * Verifies that a NEAR AI Cloud model runs in a Trusted Execution Environment:
 * it does a fresh attested completion and checks the response signature binds
 * our exact request/response bytes to a signer that the model's attestation
 * report vouches for. See https://docs.near.ai/cloud/verification.
 *
 * This proves the response was produced and signed inside the attested model
 * TEE. The full hardware quote (Intel TDX / NVIDIA GPU) is checked by NEAR's
 * Verification Center at https://cloud.near.ai/verify — not re-implemented here.
 * Server-only: reads NEAR_AI_API_KEY.
 */

const BASE = "https://cloud-api.near.ai/v1";

export type Attestation = {
  verified: boolean;
  model: string;
  /** The recovered TEE signer address, when verified. */
  signer?: string;
  signatureKind?: "provider_tee" | "gateway";
  /** Why it isn't verified (service down, no key, mismatch). */
  detail?: string;
  /** Where a human can run the full hardware-quote check. */
  verifyUrl: string;
};

/** NEAR's Verification Center needs ?model= to verify a specific deployment. */
const verifyCenter = (model: string) => `https://cloud.near.ai/verify?model=${encodeURIComponent(model)}`;
const sha256hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

type SignatureResp = {
  text?: string;
  signature?: string;
  signing_address?: string;
  signature_kind?: "provider_tee" | "gateway";
  error_code?: string;
};

/** The model TEE signing addresses the attestation report vouches for (lowercased). */
async function attestedSigners(model: string, nonce: string, key: string, f: typeof fetch): Promise<string[]> {
  const url = `${BASE}/attestation/report?model=${encodeURIComponent(model)}&signing_algo=ecdsa&nonce=${nonce}`;
  const res = await f(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`attestation report ${res.status}`);
  const data = (await res.json()) as { model_attestations?: { signing_address?: string }[] };
  return (data.model_attestations ?? [])
    .map((m) => m.signing_address?.toLowerCase())
    .filter((a): a is string => Boolean(a));
}

/** Fetch the signature for a completion; null when the node has none yet (404). */
async function fetchSignature(chatId: string, model: string, key: string, f: typeof fetch): Promise<SignatureResp | null> {
  const url = `${BASE}/signature/${encodeURIComponent(chatId)}?model=${encodeURIComponent(model)}&signing_algo=ecdsa`;
  const res = await f(url, { headers: { Authorization: `Bearer ${key}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`signature ${res.status}`);
  return (await res.json()) as SignatureResp;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Do a tiny attested completion and verify its signature end to end. Throws
 * only on an outright service/network failure; a check that fails returns
 * `{ verified: false, detail }`.
 */
export async function verifyModel(
  model: string,
  opts: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Attestation> {
  const key = process.env.NEAR_AI_API_KEY;
  if (!key) return { verified: false, model, detail: "NEAR_AI_API_KEY is not set", verifyUrl: verifyCenter(model) };
  const f = opts.fetch ?? fetch;
  const nap = opts.sleep ?? sleep;

  const nonce = randomBytes(32).toString("hex");
  const signers = await attestedSigners(model, nonce, key, f);

  const body = JSON.stringify({ model, messages: [{ role: "user", content: "attestation ping" }], max_tokens: 1 });
  const res = await f(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`completion ${res.status}`);
  const responseText = await res.text();
  const chatId = (JSON.parse(responseText) as { id?: string }).id;
  if (!chatId) return { verified: false, model, detail: "completion had no id", verifyUrl: verifyCenter(model) };

  const reqHash = sha256hex(body);
  const respHash = sha256hex(responseText);

  // The signature can lag the completion, or a lookup can hit a different node.
  let sig: SignatureResp | null = null;
  for (let attempt = 0; attempt < 4 && !sig?.signature; attempt++) {
    if (attempt) await nap(500);
    sig = await fetchSignature(chatId, model, key, f);
  }
  if (!sig?.text || !sig.signature) return { verified: false, model, detail: "signature unavailable", verifyUrl: verifyCenter(model) };

  const parts = sig.text.split(":");
  const [sigModel, sigReq, sigResp] = parts.length === 3 ? parts : ["", parts[0], parts[1]];
  if (sigReq !== reqHash || sigResp !== respHash) {
    return { verified: false, model, detail: "signed hashes don't match the response", verifyUrl: verifyCenter(model) };
  }
  if (parts.length === 3 && sigModel !== model) {
    return { verified: false, model, detail: "signed model id doesn't match", verifyUrl: verifyCenter(model) };
  }

  let recovered: string;
  try {
    recovered = verifyMessage(sig.text, sig.signature).toLowerCase();
  } catch {
    return { verified: false, model, detail: "signature didn't recover", verifyUrl: verifyCenter(model) };
  }
  if (sig.signing_address && recovered !== sig.signing_address.toLowerCase()) {
    return { verified: false, model, detail: "signer doesn't match the reported address", verifyUrl: verifyCenter(model) };
  }
  // The point of the TEE claim: the signer must be one the model attestation vouches for.
  if (sig.signature_kind === "provider_tee" && !signers.includes(recovered)) {
    return { verified: false, model, detail: "signer isn't an attested model TEE", verifyUrl: verifyCenter(model) };
  }

  return { verified: true, model, signer: recovered, signatureKind: sig.signature_kind, verifyUrl: verifyCenter(model) };
}

export type ChatAttestation = Attestation & {
  chatId: string;
  /** The request/response SHA-256 hashes NEAR AI signed for this completion. */
  signedRequestHash?: string;
  signedResponseHash?: string;
};

/**
 * Verify one already-made decision: fetch the signature NEAR AI produced for
 * its completion `chatId` and confirm it recovers to a signer the model's TEE
 * attestation vouches for. Proves this exact decision ran in the attested
 * enclave. (We don't hold the original bytes, so the hashes are shown as signed,
 * not re-derived — the full byte check is at the Verification Center.)
 */
export async function verifyChat(
  chatId: string,
  model: string,
  opts: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {},
): Promise<ChatAttestation> {
  const base = { chatId, model, verifyUrl: verifyCenter(model) };
  const key = process.env.NEAR_AI_API_KEY;
  if (!key) return { ...base, verified: false, detail: "NEAR_AI_API_KEY is not set" };
  const f = opts.fetch ?? fetch;
  const nap = opts.sleep ?? sleep;

  let sig: SignatureResp | null = null;
  for (let attempt = 0; attempt < 4 && !sig?.signature; attempt++) {
    if (attempt) await nap(500);
    sig = await fetchSignature(chatId, model, key, f);
  }
  if (!sig?.text || !sig.signature) return { ...base, verified: false, detail: "no signature for this decision" };

  const parts = sig.text.split(":");
  const [, sigReq, sigResp] = parts.length === 3 ? parts : ["", parts[0], parts[1]];
  const sigModel = parts.length === 3 ? parts[0] : model;
  const hashes = { signedRequestHash: sigReq, signedResponseHash: sigResp };

  let recovered: string;
  try {
    recovered = verifyMessage(sig.text, sig.signature).toLowerCase();
  } catch {
    return { ...base, ...hashes, verified: false, detail: "signature didn't recover" };
  }
  if (sig.signing_address && recovered !== sig.signing_address.toLowerCase()) {
    return { ...base, ...hashes, verified: false, detail: "signer doesn't match the reported address" };
  }

  const nonce = randomBytes(32).toString("hex");
  const signers = await attestedSigners(sigModel, nonce, key, f);
  if (sig.signature_kind === "provider_tee" && !signers.includes(recovered)) {
    return { ...base, ...hashes, verified: false, detail: "signer isn't an attested model TEE" };
  }

  return { ...base, ...hashes, verified: true, signer: recovered, signatureKind: sig.signature_kind };
}
