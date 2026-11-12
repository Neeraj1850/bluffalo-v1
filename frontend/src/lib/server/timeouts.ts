import { pendingHands } from "./deals";
import { claimTimeout } from "./near";

/**
 * Hands committed on-chain that couldn't be settled (e.g. the AI went down mid-hand).
 * The contract only lets anyone close them after HAND_TIMEOUT_BLOCKS, paying the
 * player the whole pot, so we park them and claim once that has passed.
 */
// ponytail: in memory, so a restart forgets parked hands (anyone can still claim
// them on-chain). Persist in the backend if restarts during failures matter.
const parked = new Map<string, number>();

/** Comfortably past the contract's 600-block timeout (~1 s blocks). */
export const CLAIM_AFTER_MS = 12 * 60_000;

export function parkUnsettled(handId: string, now = Date.now()) {
  parked.set(handId, now);
}

/** Claim every parked hand whose timeout has passed. Never throws; keeps ones that fail. */
export async function claimExpired(now = Date.now(), claim = claimTimeout): Promise<string[]> {
  const due = [...parked].filter(([, at]) => now - at >= CLAIM_AFTER_MS).map(([id]) => id);
  const done: string[] = [];
  await Promise.all(
    due.map((id) =>
      claim(id).then(
        () => {
          parked.delete(id);
          done.push(id);
          // Closed on-chain: an unrevealed hand no longer blocks its agent.
          return pendingHands.take(id).catch(() => false);
        },
        (e) => console.error("[timeouts] claim_timeout failed", id, e),
      ),
    ),
  );
  return done;
}

export const parkedHands = () => [...parked.keys()];
