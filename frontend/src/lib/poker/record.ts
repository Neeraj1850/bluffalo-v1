import { cardShort } from "@/lib/cards";
import type { HandStep, HistoryHand, ScriptedHand } from "@/lib/data/hands";
import type { PresetKey, StrategyParams } from "@/lib/data/strategy";
import type { DealProof } from "./fairness";
import { replayOf, type Replay } from "./replay";
import { describeWinner } from "./evaluate";
import { settle, type HandState, type LogEntry } from "./game";

/** A played hand: what the screens render, plus what anyone needs to verify the deal. */
export type LiveHand = ScriptedHand & {
  proof: DealProof;
  /** Starting stacks, blinds and every action: re-play the hand from the seeds to check the payout. */
  replay?: Replay;
  /** Real-money hands: the testnet transactions that committed and settled them. */
  chain?: { contract: string; agent: string; commitTx: string; settleTx: string };
  /** Real-money hands: rake the house kept from the agent's winnings (table NEAR). */
  rake?: number;
  /** Practice (free chips vs the practice bot) or real money. Older records lack it: real. */
  mode?: HandMode;
  tableId?: string;
  /** The strategy that played the hand, so tested agents can be compared. A licensed market strategy keeps its params secret: only its token. */
  agent?: { preset?: PresetKey; params?: StrategyParams; strategy?: string };
  /** When the hand was played (ms since epoch). */
  at?: number;
  /** The play session it belongs to: one practice run or one sitting at a live table. */
  run?: string;
  /** Every house decision NEAR AI made, with the exact prompt it saw: proof it never saw the player's cards. */
  housePrompts?: HousePrompt[];
};

/** One house decision made by NEAR AI: the exact request body it received and its sha256. */
export type HousePrompt = { street: LogEntry["street"]; prompt: string; requestHash: string; chatId?: string };

export type HandMode = "practice" | "real";

export const handMode = (h: Pick<LiveHand, "mode">): HandMode => h.mode ?? "real";

const BOARD: Record<LogEntry["street"], HandStep["boardCount"]> = {
  "PRE-FLOP": 0,
  FLOP: 3,
  TURN: 4,
  RIVER: 5,
  SHOWDOWN: 5,
};

const lower = (s: string) => s[0].toLowerCase() + s.slice(1);

/** Opening a street with chips is a bet; anything after (or pre-flop) is a raise. */
function isBet(log: LogEntry[], i: number) {
  const e = log[i];
  return e.street !== "PRE-FLOP" && !log.slice(0, i).some((p) => p.street === e.street && p.action === "raise");
}

/** "BET 2", "RAISE TO 6", "CALL 1", "CHECK", "FOLD". */
function label(log: LogEntry[], i: number) {
  const e = log[i];
  if (e.action === "raise") return isBet(log, i) ? `BET ${e.total}` : `RAISE TO ${e.total}`;
  if (e.action === "call") return `CALL ${e.amount}`;
  return e.action.toUpperCase();
}

/** The house's move in plain words: "called 2", "raised to 6". */
function past(log: LogEntry[], i: number) {
  const e = log[i];
  if (e.action === "raise") return isBet(log, i) ? `bet ${e.total}` : `raised to ${e.total}`;
  if (e.action === "call") return `called ${e.amount}`;
  return e.action === "check" ? "checked" : "folded";
}

/**
 * Turn a finished hand into a record. One step per agent decision (with the
 * house's reply), then a final step with the result. `reasons` are the
 * agent's, in the order it acted.
 */
export function toRecord(
  s: HandState,
  {
    id,
    table,
    reasons,
    chatIds,
    requestHashes,
    housePrompts,
    proof,
    opponent = "house agent",
  }: {
    id: string;
    table: string;
    reasons: string[];
    /** NEAR AI completion id per agent decision, aligned with `reasons`. */
    chatIds?: (string | undefined)[];
    /** sha256 of the request body per agent decision, aligned with `reasons`. */
    requestHashes?: (string | undefined)[];
    housePrompts?: HousePrompt[];
    proof: DealProof;
    opponent?: string;
  },
): LiveHand {
  const r = settle(s);
  const steps: HandStep[] = [];
  let k = 0;
  s.log.forEach((e, i) => {
    if (e.seat !== 0) return;
    // The house's answer on this street, else what it did earlier on this street.
    // A move on a later street isn't about this decision.
    const house = (j: number) => s.log[j].seat === 1 && s.log[j].street === e.street;
    const after = s.log.findIndex((_, j) => j > i && house(j));
    const before = s.log.findLastIndex((_, j) => j < i && house(j));
    const reply = after !== -1 ? after : before;
    const j = k++;
    steps.push({
      street: e.street,
      pot: e.pot,
      action: label(s.log, i),
      reason: reasons[j] ?? "",
      chatId: chatIds?.[j],
      ...(requestHashes?.[j] ? { requestHash: requestHashes[j] } : {}),
      opponent: reply === -1 ? "—" : past(s.log, reply),
      boardCount: BOARD[e.street],
    });
  });

  const net = Math.round((r.payouts[0] - s.committed[0]) * 100) / 100;
  const [mine, theirs] = r.hands ?? [null, null];
  let outcome: string;
  if (s.folded === 1) outcome = `The ${opponent} folded. Your agent takes the pot.`;
  else if (s.folded === 0) outcome = "Your agent folded — it only loses what it had already bet.";
  else if (r.winner === "split") outcome = `Both had ${lower(mine!.description)} — the pot is split.`;
  else if (r.winner === 0) outcome = `${describeWinner(mine!, theirs!)} beat the ${opponent}’s ${lower(theirs!.description)}.`;
  else outcome = `The ${opponent}’s ${lower(describeWinner(theirs!, mine!))} beat ${lower(mine!.description)}.`;

  const shown = r.hands ? (r.winner === 1 ? theirs! : mine!) : null;
  const result = r.winner === "split" ? `SPLIT ${r.payouts[0]}` : net >= 0 ? `WON ${r.pot}` : `LOST ${-net}`;
  steps.push({
    street: "SHOWDOWN",
    pot: r.pot,
    action: result,
    reason: outcome,
    opponent: s.folded === 1 ? "folded" : s.folded === 0 ? "won uncontested" : `showed ${s.hole[1].map(cardShort).join(" ")}`,
    boardCount: s.boardCount,
  });

  return {
    id: `#${id}`,
    table,
    hole: s.hole[0],
    opponentHole: s.hole[1],
    board: s.board,
    steps,
    potWon: r.payouts[0],
    net,
    stackAfter: Math.round((s.stacks[0] + r.payouts[0]) * 100) / 100,
    outcome,
    winningFive: shown?.cards ?? [],
    kickerIndex: shown?.kickerIndex ?? -1,
    proof,
    replay: replayOf(s),
    ...(housePrompts?.length ? { housePrompts } : {}),
  };
}

/** The archive row for a played hand. */

export function toHistory(h: LiveHand): HistoryHand {
  return {
    id: h.id,
    hole: h.hole,
    description: h.outcome,
    net: h.net,
    scope: "session",
    steps: h.steps
      .filter((st) => st.street !== "SHOWDOWN")
      .map((st) => ({
        street: st.street === "PRE-FLOP" ? "PRE" : st.street,
        board: st.boardCount ? h.board.slice(0, st.boardCount).map(cardShort).join(" ") : "—",
        action: `${st.action.charAt(0)}${st.action.slice(1).toLowerCase()}${st.opponent !== "—" ? `, ${st.opponent}` : ""}`,
      })),
  };
}
