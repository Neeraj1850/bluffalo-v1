import { NextResponse } from "next/server";
import { commitment } from "@/lib/poker/fairness";
import { ChainError, getHand } from "@/lib/server/near";
import { sessionFrom, sessionUser, withSession } from "@/lib/server/sessions";

const HAND_ID = /^[A-Za-z0-9_-]{1,16}$/;

/**
 * Check a hand against the contract's own record: verified once it's settled
 * and sha256(server_seed) matches the commitment made before the deal;
 * pending while still committed; unavailable otherwise.
 */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  if (!(await sessionUser(session.id))) return reply({ error: "Sign in to verify hands" }, 401);
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !HAND_ID.test(id)) return reply({ error: "Unknown hand" }, 400);
  try {
    const hand = await getHand(id);
    if (hand?.status === "Committed") return reply({ status: "pending" });
    const ok = hand?.status === "Settled" && !!hand.server_seed && (await commitment(hand.server_seed)) === hand.commitment;
    return reply({ status: ok ? "verified" : "unavailable" });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}
