import type { Limits, PresetKey, StrategyParams } from "@/lib/data/strategy";
import { getTable } from "@/lib/data/tables";
import { addHand, STOP_COPY, stopReason } from "@/lib/poker/session";
import { netAfterRake, stackAfterRake } from "@/services/houseApi";
import { leaveTable } from "./activeTable";
import { backend } from "./backend";
import { pendingHands } from "./deals";
import { PlayError, playErrorResponse, playRealHand, revealReal } from "./realHand";
import { sessionAgent } from "./sessions";

/**
 * Server autoplay: the agent keeps playing real-money hands with the tab closed.
 * Opt-in — browser mode is the default, because here the server picks the
 * player seed too (still committed before use, but the server holds both seeds).
 *
 * The config and running totals live in the backend (sessions.autoplay), so a
 * restart resumes: the next GET /api/agent(/autoplay) restarts every loop that
 * should be on.
 */
export type Autoplay = {
  tableId: string;
  params: StrategyParams;
  preset?: PresetKey;
  runId: string;
  limits: Limits;
  hands: number;
  net: number;
  stack: number;
  startedAt: number;
  /** Why it stopped (set when it turns itself off, or the player stops it). */
  stopped?: string;
};

// ponytail: in-memory loop registry, single Railway instance. With several
// instances, take a lease row in the backend before running a loop.
const running = new Map<string, Promise<void>>();
let resumed = false;

/** Pause before retrying while the agent's previous hand finishes (e.g. the browser's last one). */
export const BUSY_RETRY_MS = 2000;
const BUSY_TRIES = 30;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getAutoplay(sessionId: string) {
  return (await backend<{ on: boolean; autoplay: Autoplay | null }>(`/sessions/${sessionId}/autoplay`)) ?? { on: false, autoplay: null };
}

const save = (sessionId: string, autoplay: Autoplay, on?: boolean) =>
  backend(`/sessions/${sessionId}/autoplay`, { method: "PUT", body: { ...(on === undefined ? {} : { on }), autoplay } });

/** `hands`/`net` carry over a sitting already under way in the browser, so its limits still count it. */
export async function startAutoplay(sessionId: string, cfg: Omit<Autoplay, "startedAt" | "stopped">) {
  await save(sessionId, { ...cfg, startedAt: Date.now() }, true);
  ensureRunning(sessionId);
}

/** Stop request: the hand in play finishes, then the loop exits. */
export async function stopAutoplay(sessionId: string, reason = "Stopped by you.") {
  const { autoplay } = await getAutoplay(sessionId);
  if (autoplay) await save(sessionId, { ...autoplay, stopped: reason }, false);
}

export const isRunning = (sessionId: string) => running.has(sessionId);
/** The running loop (tests await it). */
export const loopOf = (sessionId: string) => running.get(sessionId);

export function ensureRunning(sessionId: string) {
  if (running.has(sessionId)) return;
  running.set(
    sessionId,
    loop(sessionId)
      .catch((e) => console.error("[autoplay] loop crashed", sessionId, e))
      .finally(() => running.delete(sessionId)),
  );
}

/** After a restart: restart every loop that should be on (once per process). */
export async function resumeAll() {
  if (resumed) return;
  resumed = true;
  try {
    const r = await backend<{ sessions: string[] }>("/autoplay");
    r?.sessions.forEach(ensureRunning);
  } catch (e) {
    resumed = false;
    console.error("[autoplay] resume failed", e);
  }
}

/** Tests: forget the in-process state, as a restart would. */
export function resetAutoplayForTests() {
  running.clear();
  resumed = false;
}

async function loop(sessionId: string) {
  let busy = 0;
  for (;;) {
    const { on, autoplay: cfg } = await getAutoplay(sessionId);
    if (!on || !cfg) return leaveTable(sessionId);
    const limit = stopReason(cfg, cfg.limits, getTable(cfg.tableId).blinds.big);
    if (limit) return finish(sessionId, cfg, STOP_COPY[limit]);
    try {
      const hand = await playRealHand(sessionId, {
        tableId: cfg.tableId,
        params: cfg.params,
        ...(cfg.preset ? { preset: cfg.preset } : {}),
        runId: cfg.runId,
        stack: cfg.stack,
        button: (cfg.hands % 2) as 0 | 1,
      }).catch((e) => resumeOwnHand(sessionId, e));
      busy = 0;
      const next = addHand(cfg, { net: netAfterRake(hand), stackAfter: stackAfterRake(hand) });
      // Progress only: a stop request that came in mid-hand keeps its flag and reason.
      const stopped = (await getAutoplay(sessionId)).autoplay?.stopped;
      await save(sessionId, { ...cfg, ...next, ...(stopped ? { stopped } : {}) });
    } catch (e) {
      // The browser's last hand is still finishing (or awaiting its reveal): wait a little.
      if (e instanceof PlayError && (e.code === "busy" || e.code === "awaiting_reveal") && ++busy < BUSY_TRIES) {
        await sleep(BUSY_RETRY_MS);
        continue;
      }
      // Limits, house closed, out of chips, NEAR AI or chain down: stop and say why.
      const r = playErrorResponse(e);
      if (!r) console.error("[autoplay] hand failed", sessionId, e);
      return finish(sessionId, cfg, String(r?.body.error ?? "Autoplay stopped after an unexpected error."));
    }
  }
}

/**
 * A restart can leave this loop's own hand committed but unrevealed. The server
 * chose that seed, so finish it with the same seed (never a new one).
 */
async function resumeOwnHand(sessionId: string, e: unknown) {
  if (!(e instanceof PlayError && e.code === "awaiting_reveal")) throw e;
  const agent = await sessionAgent(sessionId);
  const p = agent ? await pendingHands.forAgent(agent) : null;
  if (!p?.autoSeed || p.sessionId !== sessionId) throw e;
  return revealReal(sessionId, p.handId, p.autoSeed);
}

async function finish(sessionId: string, cfg: Autoplay, reason: string) {
  const cur = await getAutoplay(sessionId);
  // Already stopped by the player: keep their reason.
  await save(sessionId, { ...cfg, stopped: (!cur.on && cur.autoplay?.stopped) || reason }, false);
  leaveTable(sessionId);
}
