export type PresetKey = "rock" | "shark" | "maniac" | "custom";
export type ParamKey = "aggression" | "bluff" | "position" | "sizing";

export type StrategyParams = Record<ParamKey, number>;

export type Preset = {
  key: PresetKey;
  label: string;
  tag: string;
  description: string;
  params: StrategyParams | null;
};

export const PRESETS: Preset[] = [
  {
    key: "rock",
    label: "Rock",
    tag: "Preset 01 · patient",
    description: "Plays only strong hands and rarely bluffs. Small, steady results.",
    params: { aggression: 20, bluff: 5, position: 60, sizing: 35 },
  },
  {
    key: "shark",
    label: "Shark",
    tag: "Preset 02 · balanced pro",
    description: "Waits for good spots, then attacks. A solid default for most tables.",
    params: { aggression: 65, bluff: 30, position: 85, sizing: 60 },
  },
  {
    key: "maniac",
    label: "Maniac",
    tag: "Preset 03 · chaos",
    description: "Bets constantly and bluffs a lot. Can win big, can lose fast.",
    params: { aggression: 92, bluff: 70, position: 40, sizing: 90 },
  },
  {
    key: "custom",
    label: "Custom",
    tag: "Your mix",
    description: "Your own settings. Each slider below explains what it changes.",
    params: null,
  },
];

export function getPreset(key: PresetKey) {
  return PRESETS.find((p) => p.key === key)!;
}

const band = (n: number, low: string, mid: string, high: string) =>
  n < 34 ? low : n < 67 ? mid : high;

export type ParamDef = {
  key: ParamKey;
  label: string;
  lo: string;
  hi: string;
  hint: (value: number) => string;
};

/** Every parameter explained in plain English — no poker knowledge needed. */
export const PARAMS: ParamDef[] = [
  {
    key: "aggression",
    label: "Aggression",
    lo: "calm",
    hi: "pushy",
    hint: (v) =>
      band(
        v,
        "Mostly checks and calls. Loses less, wins smaller pots.",
        "Bets its good hands, folds its bad ones.",
        "Bets and raises often to push others out of the hand.",
      ),
  },
  {
    key: "bluff",
    label: "Bluff frequency",
    lo: "honest",
    hi: "sneaky",
    hint: (v) =>
      v === 0
        ? "Never bets with a weak hand."
        : `Bets with a weak hand about ${Math.max(1, Math.round(v / 10))} in 10 times, hoping others fold.`,
  },
  {
    key: "position",
    label: "Position awareness",
    lo: "ignores seat",
    hi: "uses seat",
    hint: (v) =>
      band(
        v,
        "Plays the same no matter where it sits.",
        "Plays a few more hands when it acts last.",
        "Plays many more hands when it acts last — it gets to see what others do first.",
      ),
  },
  {
    key: "sizing",
    label: "Bet sizing",
    lo: "small",
    hi: "big",
    hint: (v) =>
      band(
        v,
        "Small bets. Cheaper, less pressure on others.",
        "Medium bets, around half the pot.",
        "Big bets. More pressure, bigger swings.",
      ),
  },
];

export type LimitKey = "stopLoss" | "takeProfit" | "maxHands";
export type Limits = Record<LimitKey, number>;

export type LimitDef = {
  key: LimitKey;
  label: string;
  hint: (v: number) => string;
  step: number;
  min: number;
  max: number;
  decLabel: string;
  incLabel: string;
};

export const LIMITS: LimitDef[] = [
  {
    key: "stopLoss",
    label: "Stop loss",
    hint: (v) => `Stops after losing ${v} GNEAR`,
    step: 5,
    min: 5,
    max: 100,
    decLabel: "Decrease stop loss",
    incLabel: "Increase stop loss",
  },
  {
    key: "takeProfit",
    label: "Take profit",
    hint: (v) => `Stops after winning ${v} GNEAR`,
    step: 10,
    min: 10,
    max: 300,
    decLabel: "Decrease take profit",
    incLabel: "Increase take profit",
  },
  {
    key: "maxHands",
    label: "Max hands",
    hint: () => "Then it leaves the table",
    step: 10,
    min: 10,
    max: 500,
    decLabel: "Fewer hands",
    incLabel: "More hands",
  },
];

export const DEFAULT_LIMITS: Limits = { stopLoss: 25, takeProfit: 60, maxHands: 100 };
export const DEFAULT_PRESET: PresetKey = "shark";
