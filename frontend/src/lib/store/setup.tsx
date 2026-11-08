"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LIMITS,
  DEFAULT_PRESET,
  getPreset,
  type LimitKey,
  type Limits,
  type ParamKey,
  type PresetKey,
  type StrategyParams,
} from "@/lib/data/strategy";
import { defaultBuyIn, DEFAULT_TABLE_ID, getTable } from "@/lib/data/tables";
import { pushHand, type LiveHand } from "@/lib/poker/record";

/**
 * What the player has chosen so far. Carried from lobby → strategy →
 * deploy → game. Lives in sessionStorage so a refresh doesn't lose it.
 */
export type SetupState = {
  connected: boolean;
  /** Demo starting balance until the account service is wired. */
  balance: number;
  tableId: string;
  preset: PresetKey;
  params: StrategyParams;
  limits: Limits;
  agent:
    | { status: "idle" }
    | { status: "deployed"; account: string; buyIn: number; tableId: string; at: number };
  /** Real-money hands the agent has played, newest first, with their deal proofs. */
  hands: LiveHand[];
};

const STORAGE_KEY = "np-setup-v1";

const initialState: SetupState = {
  connected: false,
  balance: 120,
  tableId: DEFAULT_TABLE_ID,
  preset: DEFAULT_PRESET,
  params: { ...getPreset(DEFAULT_PRESET).params! },
  limits: { ...DEFAULT_LIMITS },
  agent: { status: "idle" },
  hands: [],
};

type SetupContextValue = SetupState & {
  hydrated: boolean;
  buyIn: number;
  connect: () => void;
  selectTable: (id: string) => void;
  choosePreset: (key: PresetKey) => void;
  setParam: (key: ParamKey, value: number) => void;
  setLimit: (key: LimitKey, value: number) => void;
  markDeployed: (account: string) => void;
  stopAgent: (returnedStack?: number) => void;
  /** Funds confirmed as sent out of the app: agent stack first, then balance. */
  withdraw: (source: "agent" | "balance", amount: number) => void;
  recordHand: (hand: LiveHand) => void;
};

const SetupContext = createContext<SetupContextValue | null>(null);

export function SetupProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SetupState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...initialState, ...(JSON.parse(raw) as Partial<SetupState>) });
    } catch {
      // Corrupt or unavailable storage: start fresh.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Non-critical.
    }
  }, [state, hydrated]);

  const table = getTable(state.tableId);
  const buyIn = defaultBuyIn(table);

  const connect = useCallback(() => setState((s) => ({ ...s, connected: true })), []);
  const selectTable = useCallback((id: string) => setState((s) => ({ ...s, tableId: id })), []);
  const choosePreset = useCallback(
    (key: PresetKey) =>
      setState((s) => {
        const p = getPreset(key).params;
        return { ...s, preset: key, params: p ? { ...p } : s.params };
      }),
    [],
  );
  const setParam = useCallback(
    (key: ParamKey, value: number) =>
      setState((s) => ({ ...s, preset: "custom", params: { ...s.params, [key]: value } })),
    [],
  );
  const setLimit = useCallback(
    (key: LimitKey, value: number) => setState((s) => ({ ...s, limits: { ...s.limits, [key]: value } })),
    [],
  );
  const markDeployed = useCallback(
    (account: string) =>
      setState((s) => ({
        ...s,
        balance: s.balance - defaultBuyIn(getTable(s.tableId)),
        agent: {
          status: "deployed",
          account,
          buyIn: defaultBuyIn(getTable(s.tableId)),
          tableId: s.tableId,
          at: Date.now(),
        },
      })),
    [],
  );
  /** Agent leaves the table; whatever stack it has left returns to the playing balance. */
  const stopAgent = useCallback(
    (returnedStack = 0) =>
      setState((s) =>
        s.agent.status === "deployed"
          ? { ...s, balance: s.balance + returnedStack, agent: { status: "idle" } }
          : s,
      ),
    [],
  );

  const withdraw = useCallback(
    (source: "agent" | "balance", amount: number) =>
      setState((s) =>
        source === "agent"
          ? { ...s, agent: { status: "idle" } }
          : { ...s, balance: Math.max(0, s.balance - amount) },
      ),
    [],
  );

  const recordHand = useCallback(
    (hand: LiveHand) => setState((s) => ({ ...s, hands: pushHand(s.hands, hand) })),
    [],
  );

  const value = useMemo<SetupContextValue>(
    () => ({
      ...state,
      hydrated,
      buyIn,
      connect,
      selectTable,
      choosePreset,
      setParam,
      setLimit,
      markDeployed,
      stopAgent,
      withdraw,
      recordHand,
    }),
    [state, hydrated, buyIn, connect, selectTable, choosePreset, setParam, setLimit, markDeployed, stopAgent, withdraw, recordHand],
  );

  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

export function useSetup() {
  const ctx = useContext(SetupContext);
  if (!ctx) throw new Error("useSetup must be used inside <SetupProvider>");
  return ctx;
}
