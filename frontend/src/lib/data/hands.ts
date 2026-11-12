import type { Card } from "@/lib/cards";

/** Shapes of a played hand, as the server records and the UI replays them. */

export type Street = "PRE-FLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN";

export type HandStep = {
  street: Street;
  /** Pot after this step, NEAR. */
  pot: number;
  /** Agent's decision, e.g. "BET 2". */
  action: string;
  /** One-line plain-English reason. */
  reason: string;
  /** What the opponent did / is doing. */
  opponent: string;
  /** Community cards visible after this step. */
  boardCount: 0 | 3 | 4 | 5;
  /** The NEAR AI completion id behind this agent decision, for TEE verification. */
  chatId?: string;
};

export type ScriptedHand = {
  id: string;
  table: string;
  hole: Card[];
  opponentHole: Card[];
  board: Card[];
  steps: HandStep[];
  potWon: number;
  /** Net after the agent's own contributions. */
  net: number;
  stackAfter: number;
  outcome: string;
  winningFive: Card[];
  /** Index in winningFive that doesn't play (kicker), drawn dimmed. */
  kickerIndex: number;
};

export type HistoryHand = {
  id: string;
  hole: Card[];
  description: string;
  net: number;
  scope: "session" | "week" | "all";
  steps: { street: string; board: string; action: string }[];
};
