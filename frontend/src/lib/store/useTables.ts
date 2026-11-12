"use client";

import { useEffect, useState } from "react";
import { fetchTables, type TableStatus } from "@/services/houseApi";

type Tables = { status: Record<string, TableStatus> | null; houseBalance: number | null };

/** Table open/closed status and the house bankroll from the server. Unknown (null) until loaded or on error. */
export function useTables(): Tables {
  const [tables, setTables] = useState<Tables>({ status: null, houseBalance: null });
  useEffect(() => {
    let cancelled = false;
    fetchTables()
      .then(
        (r) =>
          !cancelled &&
          setTables({ status: Object.fromEntries(r.tables.map((t) => [t.id, t])), houseBalance: r.house?.balance ?? null }),
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return tables;
}
