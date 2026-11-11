import { NextResponse } from "next/server";
import { TABLES } from "@/lib/data/tables";
import { tableStatus } from "@/lib/server/economics";
import { ChainError, houseBalance } from "@/lib/server/near";

/**
 * Which real-money tables are open right now and the most each takes as a
 * buy-in, from the house's on-chain balance (table NEAR). Public: no session.
 */
export async function GET() {
  try {
    const balance = await houseBalance();
    const tables = TABLES.filter((t) => t.mode === "real").map((t) => tableStatus(t, balance));
    return NextResponse.json({ tables, house: { balance } });
  } catch (e) {
    if (e instanceof ChainError) return NextResponse.json({ error: e.message, code: "chain_down" }, { status: 503 });
    throw e;
  }
}

export const runtime = "nodejs";
