import { NextResponse } from "next/server";
import { commitment } from "@/lib/poker/fairness";
import { ChainError, fromYocto, getHand } from "@/lib/server/near";
import { sessionFrom, sessionUser, withSession } from "@/lib/server/sessions";

const HAND_ID = /^[A-Za-z0-9_-]{1,16}$/;
/** Hands played before contract v2 live on the first contract. Only our own contracts are read. */
const LEGACY_CONTRACTS = ["npk-63o824.testnet"];

/**
 * Check a hand against the contract's own record: verified once it's settled,
 * sha256(server_seed) matches the commitment made before the deal, and (contract
 * v2) sha256(player_seed) matches the player commitment made before the deal too.
 * Pending while still committed; unavailable otherwise.
 */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  if (!(await sessionUser(session.id))) return reply({ error: "Sign in to verify hands" }, 401);
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !HAND_ID.test(id)) return reply({ error: "Unknown hand" }, 400);
  const contract = new URL(request.url).searchParams.get("contract") ?? undefined;
  if (contract && contract !== process.env.NEAR_CONTRACT_ID && !LEGACY_CONTRACTS.includes(contract)) {
    return reply({ error: "Unknown contract" }, 400);
  }
  try {
    const hand = await getHand(id, contract);
    if (hand?.status === "Committed") return reply({ status: "pending" });
    const serverOk =
      hand?.status === "Settled" && !!hand.server_seed && (await commitment(hand.server_seed)) === hand.commitment;
    const playerOk =
      !hand?.player_commitment || (!!hand.player_seed && (await commitment(hand.player_seed)) === hand.player_commitment);
    if (!(serverOk && playerOk)) return reply({ status: "unavailable" });
    // The revealed seeds, stake and payout, so the browser can re-play the hand and check the payout itself.
    return reply({
      status: "verified",
      hand: {
        serverSeed: hand!.server_seed,
        playerSeed: hand!.player_seed,
        stake: hand!.stake ? fromYocto(hand!.stake) : null,
        payout: hand!.payout ? fromYocto(hand!.payout) : null,
      },
    });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}
