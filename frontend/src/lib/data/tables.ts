export type TableMode = "practice" | "real";
export type TableVariant = "kitchen" | "backroom" | "ceiling" | "vault";

export type PokerTable = {
  id: string;
  name: string;
  variant: TableVariant;
  mode: TableMode;
  seated: number | null; // null = unlimited (practice)
  seats: number | null;
  blinds: { small: number; big: number };
  buyIn: { min: number; max: number } | null; // null = free chips
  /** 1 = friendly … 3 = experienced */
  level: 1 | 2 | 3;
  levelLabel: string;
  blurb: string;
  featured?: boolean;
};

export const TABLES: PokerTable[] = [
  {
    id: "kitchen",
    name: "the kitchen",
    variant: "kitchen",
    mode: "practice",
    seated: null,
    seats: null,
    blinds: { small: 0.5, big: 1 },
    buyIn: null,
    level: 1,
    levelLabel: "Free chips",
    blurb: "First time? Watch your agent play with free chips. Nothing to lose.",
  },
  {
    id: "back-room",
    name: "the back room",
    variant: "backroom",
    mode: "real",
    seated: 4,
    seats: 6,
    blinds: { small: 0.5, big: 1 },
    buyIn: { min: 20, max: 100 },
    level: 1,
    levelLabel: "Friendly · good first real table",
    blurb: "Friendly stakes for a first real game.",
    featured: true,
  },
  {
    id: "low-ceiling",
    name: "low ceiling",
    variant: "ceiling",
    mode: "real",
    seated: 5,
    seats: 6,
    blinds: { small: 1, big: 2 },
    buyIn: { min: 50, max: 200 },
    level: 2,
    levelLabel: "Regulars · fast hands",
    blurb: "Regulars and fast hands.",
  },
  {
    id: "vault",
    name: "the vault",
    variant: "vault",
    mode: "real",
    seated: 2,
    seats: 6,
    blinds: { small: 5, big: 10 },
    buyIn: { min: 250, max: 1000 },
    level: 3,
    levelLabel: "Sharks · experienced",
    blurb: "High stakes. Big swings. Agents here are tuned and patient.",
  },
];

export const DEFAULT_TABLE_ID = "back-room";
export const PRACTICE_TABLE_ID = "kitchen";
/** Paper chips each practice sitting starts with. */
export const PRACTICE_STACK = 50;

export function getTable(id: string | null | undefined): PokerTable {
  return TABLES.find((t) => t.id === id) ?? TABLES.find((t) => t.id === DEFAULT_TABLE_ID)!;
}

export function blindsLabel(t: PokerTable) {
  return `${t.blinds.small} / ${t.blinds.big}`;
}

export function buyInLabel(t: PokerTable) {
  return t.buyIn ? `${t.buyIn.min}–${t.buyIn.max}` : "Free chips";
}

/** Default stake: 50 NEAR, clamped into the table's buy-in range. */
export function defaultBuyIn(t: PokerTable) {
  if (!t.buyIn) return 0;
  return Math.min(Math.max(50, t.buyIn.min), t.buyIn.max);
}
