import { cards, type Card } from "@/lib/cards";

/**
 * Demo hand data. Until the agent backend streams real hands, every screen
 * plays back these scripts. They are clearly demo content — replace with
 * the live feed in `services/agentApi`.
 */

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

/** The hero hand: Q♠ Q♢ vs 9♡ 8♠ on 9♣ 4♡ 2♠ K♢ 4♣ — queens-and-fours beats nines-and-fours. */
export const DEMO_HAND: ScriptedHand = {
  id: "#0042",
  table: "the back room",
  hole: cards("Qs", "Qd"),
  opponentHole: cards("9h", "8s"),
  board: cards("9c", "4h", "2s", "Kd", "4c"),
  steps: [
    {
      street: "PRE-FLOP",
      pot: 1.5,
      action: "CALL 1",
      reason: "Pair of queens. Strong start — keep it cheap and stay in.",
      opponent: "thinking",
      boardCount: 0,
    },
    {
      street: "FLOP",
      pot: 4.5,
      action: "BET 2",
      reason: "Queens beat this board. Make anyone chasing a better hand pay.",
      opponent: "called 2",
      boardCount: 3,
    },
    {
      street: "TURN",
      pot: 4.5,
      action: "CHECK",
      reason: "A king landed — it could beat us. Check to keep the pot small.",
      opponent: "checked",
      boardCount: 4,
    },
    {
      street: "RIVER",
      pot: 12.5,
      action: "BET 4",
      reason: "Nothing scary arrived. Bet for value; weaker pairs will call.",
      opponent: "called 4",
      boardCount: 5,
    },
    {
      street: "SHOWDOWN",
      pot: 12.5,
      action: "WON 12.5",
      reason: "House agent shows nines and fours. Your queens and fours take the pot.",
      opponent: "showed 9♡ 8♠",
      boardCount: 5,
    },
  ],
  potWon: 12.5,
  net: 6,
  stackAfter: 56,
  outcome:
    "Two pair, queens and fours, beat the house agent’s nines and fours.",
  winningFive: cards("Qs", "Qd", "4h", "4c", "Kd"),
  kickerIndex: 4,
};

/** Practice-mode script: a shorter feed with reasons, against a practice bot. */
export const PRACTICE_STEPS = [
  { street: "PRE", action: "CALL 1", reason: "Pair of queens — strong start, no need to scare anyone yet.", board: 0 },
  { street: "FLOP", action: "BET 2", reason: "Board is 9♣ 4♡ 2♠. Queens are likely best — charge them to see more.", board: 3 },
  { street: "FLOP", action: "CALL 2", reason: "Bot raised. Could be a bluff; folding queens here is too timid.", board: 3 },
  { street: "TURN", action: "CHECK", reason: "A king arrived. If the bot has one, betting loses more. Wait and see.", board: 4 },
  { street: "RIVER", action: "BET 4", reason: "Another 4 — nothing scary. Bet for value; weaker pairs will call.", board: 5 },
  { street: "END", action: "WON 6.5", reason: "Bot called with a pair of nines. Queens hold. (Practice chips.)", board: 5 },
] as const;

export const PRACTICE_WIN = 6.5;

export type HistoryHand = {
  id: string;
  hole: Card[];
  description: string;
  net: number;
  scope: "session" | "week" | "all";
  steps: { street: string; board: string; action: string }[];
};

export const HISTORY: HistoryHand[] = [
  {
    id: "#0042",
    hole: cards("Qs", "Qd"),
    description: "Queens held up against nines",
    net: 6,
    scope: "session",
    steps: [
      { street: "PRE", board: "—", action: "Called 1" },
      { street: "FLOP", board: "9♣ 4♡ 2♠", action: "Bet 2, called" },
      { street: "TURN", board: "K♢", action: "Checked" },
      { street: "RIVER", board: "4♣", action: "Bet 4, called · won" },
    ],
  },
  {
    id: "#0041",
    hole: cards("Ac", "7c"),
    description: "Folded to a big river bet",
    net: -3,
    scope: "session",
    steps: [
      { street: "PRE", board: "—", action: "Raised 3" },
      { street: "FLOP", board: "J♠ 8♡ 3♣", action: "Checked" },
      { street: "TURN", board: "2♢", action: "Checked" },
      { street: "RIVER", board: "Q♠", action: "Folded to 9" },
    ],
  },
  {
    id: "#0040",
    hole: cards("Kh", "Jh"),
    description: "Flush draw missed",
    net: -2,
    scope: "session",
    steps: [
      { street: "PRE", board: "—", action: "Called 1" },
      { street: "FLOP", board: "7♡ 2♡ 9♠", action: "Called 1" },
      { street: "TURN", board: "5♣", action: "Checked" },
      { street: "RIVER", board: "3♠", action: "Checked · lost" },
    ],
  },
  {
    id: "#0039",
    hole: cards("8s", "8c"),
    description: "Three eights on the flop",
    net: 9,
    scope: "week",
    steps: [
      { street: "PRE", board: "—", action: "Called 1" },
      { street: "FLOP", board: "8♢ K♣ 4♠", action: "Bet 2, raised to 6" },
      { street: "TURN", board: "6♡", action: "Bet 2, called" },
      { street: "RIVER", board: "A♣", action: "Checked · won" },
    ],
  },
  {
    id: "#0038",
    hole: cards("10d", "4s"),
    description: "Folded before the flop",
    net: -0.5,
    scope: "week",
    steps: [{ street: "PRE", board: "—", action: "Folded · lost small blind" }],
  },
  {
    id: "#0037",
    hole: cards("Ah", "Ks"),
    description: "Top pair took a small pot",
    net: 2.5,
    scope: "all",
    steps: [
      { street: "PRE", board: "—", action: "Raised 3, called" },
      { street: "FLOP", board: "A♢ 6♣ 2♡", action: "Bet 2 · opponent folded" },
    ],
  },
];
