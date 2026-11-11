"use client";

import { useEffect, useState } from "react";
import { fetchTables, type TableStatus } from "@/services/houseApi";

/** Table open/closed status from the server. Unknown (null map) until loaded or on error. */
export function useTables() {
  const [status, setStatus] = useState<Record<string, TableStatus> | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchTables()
      .then((r) => !cancelled && setStatus(Object.fromEntries(r.tables.map((t) => [t.id, t]))))
      .catch(() => !cancelled && setStatus(null));
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}
