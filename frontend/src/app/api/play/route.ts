import { NextResponse } from "next/server";
import { getTable } from "@/lib/data/tables";
import { takeSeed } from "@/lib/server/deals";
import { recordHand } from "@/lib/server/hands";
import { parsePlayRequest, playHand } from "@/lib/server/play";
import { claimTableOrThrow, commitReal, playErrorResponse, prepareReal, revealReal } from "@/lib/server/realHand";
import { sessionFrom, withSession } from "@/lib/server/sessions";


/**
 * Play a hand committed with POST /api/deal. The response reveals the seed.
 *
 * Practice: one request with `playerSeed`. Real money is two steps, so the
 * server can't see the deck before it's bound on-chain (no last look):
 *  1. `{ ...hand, playerCommitment }` (sha256 of the player seed) → the server
 *     commits both hashes and stakes on NEAR testnet → `{ handId, commitTx }`.
 *  2. `{ handId, playerSeed }` → checked against the commitment, played, and
 *     settled on-chain with both seeds → the hand.
 * If step 2 never settles, the contract's claim_timeout pays the player the pot.
 */
export async function POST(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);

  const body = await request.json().catch(() => null);
  if (body && typeof body === "object" && !("tableId" in body) && "playerSeed" in body) {
    return reveal(body as { handId?: unknown; playerSeed?: unknown }, session.id, reply);
  }
  const req = parsePlayRequest(body);
  if (typeof req === "string") return reply({ error: req }, 400);
  if (real(req.tableId) !== !!req.playerCommitment) {
    return reply({ error: real(req.tableId) ? "Real-money hands send playerCommitment first" : "Practice hands send playerSeed" }, 400);
  }

  try {
    // Real money needs a signed-in player with a deployed agent; practice is open to anyone.
    const agent = real(req.tableId) ? await prepareReal(session.id, req) : null;
    claimTableOrThrow(session.id, req.tableId);

    const deal = await takeSeed(req.handId, session.id);
    if (!deal) return reply({ error: "Unknown, expired or already played hand" }, 404);

    if (!agent) {
      const hand = await playHand({ ...req, playerSeed: req.playerSeed! }, deal);
      // Practice hands are archived too (History → Practice, tested agents). Best effort:
      // a free hand shouldn't fail because the archive hiccuped.
      await recordHand(session.id, hand).catch((e) => console.error("[play] practice record failed", hand.id, e));
      return reply(hand);
    }

    const commitTx = await commitReal({
      sessionId: session.id,
      agent,
      deal,
      playerCommitment: req.playerCommitment!,
      req,
      tableId: req.tableId,
      stack: req.stack,
      handId: req.handId,
    });
    return reply({ handId: req.handId, commitTx });
  } catch (e) {
    const r = playErrorResponse(e);
    if (r) return reply(r.body, r.status);
    throw e;
  }
}

const real = (tableId: string) => getTable(tableId).mode === "real";

/** Step 2 of a real-money hand: the player's seed for a hand already committed on-chain. */
async function reveal(
  b: { handId?: unknown; playerSeed?: unknown },
  sessionId: string,
  reply: (body: unknown, status?: number) => Response,
) {
  if (typeof b.handId !== "string" || typeof b.playerSeed !== "string" || !/^[0-9a-f]{32}$/.test(b.playerSeed)) {
    return reply({ error: "Invalid reveal" }, 400);
  }
  try {
    return reply(await revealReal(sessionId, b.handId, b.playerSeed));
  } catch (e) {
    const r = playErrorResponse(e);
    if (r) return reply(r.body, r.status);
    throw e;
  }
}
