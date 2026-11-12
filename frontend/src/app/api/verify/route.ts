import { MODELS } from "@/lib/server/nearai";
import { type Attestation, verifyChat, verifyModel } from "@/lib/server/nearaiAttest";

const CHAT_ID = /^[A-Za-z0-9_-]{6,80}$/;
const MAX_CHATS = 12;

/**
 * TEE attestation for the AI's decisions. With `?chats=<id,id,…>` it checks the
 * signatures NEAR AI produced for those exact decisions (a hand's moves): verified
 * only if every one recovers to a signer the model's TEE attestation vouches for.
 * Without it, a fresh completion shows the model itself is attested.
 */
export async function GET(request: Request): Promise<Response> {
  const chats = (new URL(request.url).searchParams.get("chats") ?? "")
    .split(",")
    .filter((c) => CHAT_ID.test(c))
    .slice(0, MAX_CHATS);
  try {
    if (!chats.length) return Response.json(await verifyModel(MODELS.agent));
    const results = await Promise.all(chats.map((id) => verifyChat(id, MODELS.agent)));
    const ok = results.filter((r) => r.verified);
    const failed = results.find((r) => !r.verified);
    return Response.json({
      verified: ok.length === results.length,
      model: MODELS.agent,
      signer: ok[0]?.signer,
      decisions: results.length,
      verifiedDecisions: ok.length,
      detail: failed ? `${failed.detail ?? "unverified"} (decision ${failed.chatId})` : undefined,
      verifyUrl: results[0].verifyUrl,
    });
  } catch {
    const body: Attestation = {
      verified: false,
      model: MODELS.agent,
      detail: "NEAR AI attestation service is unreachable",
      verifyUrl: `https://cloud.near.ai/verify?model=${encodeURIComponent(MODELS.agent)}`,
    };
    return Response.json(body, { status: 200 });
  }
}

export const runtime = "nodejs";
