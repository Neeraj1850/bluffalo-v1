import { MODELS } from "@/lib/server/nearai";
import { type Attestation, verifyChat, verifyModel } from "@/lib/server/nearaiAttest";

const CHAT_ID = /^[A-Za-z0-9_-]{6,80}$/;
const MAX_CHATS = 12;

/**
 * TEE attestation for the AI's decisions. With `?chats=<id,id,…>` it checks the
 * signatures NEAR AI produced for those exact decisions (a hand's moves): verified
 * only if every one recovers to a signer the model's TEE attestation vouches for.
 * Without it, a fresh completion shows the model itself is attested.
 * `&seat=house` checks the house model's decisions instead of the agent's.
 * Each decision's signed request hash comes back too, so the client can match
 * it against sha256 of the prompt stored in the hand record.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const model = params.get("seat") === "house" ? MODELS.house : MODELS.agent;
  const chats = (params.get("chats") ?? "")
    .split(",")
    .filter((c) => CHAT_ID.test(c))
    .slice(0, MAX_CHATS);
  try {
    if (!chats.length) return Response.json(await verifyModel(model));
    const results = await Promise.all(chats.map((id) => verifyChat(id, model)));
    const ok = results.filter((r) => r.verified);
    const failed = results.find((r) => !r.verified);
    return Response.json({
      verified: ok.length === results.length,
      model,
      signer: ok[0]?.signer,
      decisions: results.length,
      verifiedDecisions: ok.length,
      detail: failed ? `${failed.detail ?? "unverified"} (decision ${failed.chatId})` : undefined,
      verifyUrl: results[0].verifyUrl,
      requests: results.map((r) => ({ chatId: r.chatId, verified: r.verified, signedRequestHash: r.signedRequestHash })),
    });
  } catch {
    const body: Attestation = {
      verified: false,
      model,
      detail: "NEAR AI attestation service is unreachable",
      verifyUrl: `https://cloud.near.ai/verify?model=${encodeURIComponent(model)}`,
    };
    return Response.json(body, { status: 200 });
  }
}

export const runtime = "nodejs";
