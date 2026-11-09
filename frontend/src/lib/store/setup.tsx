"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

/**
 * What the player has chosen so far. Carried from lobby → strategy →
 * deploy → game. Saved to the server session (Postgres) so a refresh or a
 * new tab doesn't lose it.
 */
export type SetupState = {
  /** Demo starting balance until the account service is wired. */
  balance: number;
  tableId: string;
  preset: PresetKey;
  params: StrategyParams;
  limits: Limits;
  agent:
    | { status: "idle" }
    | { status: "deployed"; account: string; buyIn: number; tableId: string; at: number };
};

const SAVE_DEBOUNCE_MS = 300;

const initialState: SetupState = {
  balance: 120,
  tableId: DEFAULT_TABLE_ID,
  preset: DEFAULT_PRESET,
  params: { ...getPreset(DEFAULT_PRESET).params! },
  limits: { ...DEFAULT_LIMITS },
  agent: { status: "idle" },
};

type SetupContextValue = SetupState & {
  hydrated: boolean;
  buyIn: number;
  /** Replace everything with a saved setup (after sign-in links the user's session). */
  adopt: (saved: Partial<SetupState>) => void;
  /** Back to defaults (after sign-out). */
  reset: () => void;
  selectTable: (id: string) => void;
  choosePreset: (key: PresetKey) => void;
  setParam: (key: ParamKey, value: number) => void;
  setLimit: (key: LimitKey, value: number) => void;
  markDeployed: (account: string) => void;
  stopAgent: (returnedStack?: number) => void;
  /** Funds confirmed as sent out of the app: agent stack first, then balance. */
  withdraw: (source: "agent" | "balance", amount: number) => void;
};

const SetupContext = createContext<SetupContextValue | null>(null);

export function SetupProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SetupState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  // Set once sign-in has adopted the user's session, so a slower first load can't overwrite it.
  const adopted = useRef(false);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : { state: {} }))
      .then(({ state: saved }) => {
        if (!adopted.current) setState({ ...initialState, ...(saved as Partial<SetupState>) });
      })
      .catch(() => {
        // Server unreachable: start fresh; saving retries on the next change.
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => {
      fetch("/api/session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      }).catch(() => {
        // Non-critical: the next change saves again.
      });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [state, hydrated]);

  const table = getTable(state.tableId);
  const buyIn = defaultBuyIn(table);

  const adopt = useCallback((saved: Partial<SetupState>) => {
    adopted.current = true;
    setState({ ...initialState, ...saved });
    setHydrated(true);
  }, []);
  const reset = useCallback(() => setState(initialState), []);
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

  const value = useMemo<SetupContextValue>(
    () => ({
      ...state,
      hydrated,
      buyIn,
      adopt,
      reset,
      selectTable,
      choosePreset,
      setParam,
      setLimit,
      markDeployed,
      stopAgent,
      withdraw,
    }),
    [state, hydrated, buyIn, adopt, reset, selectTable, choosePreset, setParam, setLimit, markDeployed, stopAgent, withdraw],
  );

  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

export function useSetup() {
  const ctx = useContext(SetupContext);
  if (!ctx) throw new Error("useSetup must be used inside <SetupProvider>");
  return ctx;
}
