import { houseStatus } from "@/lib/server/house";
import { ChainError } from "@/lib/server/near";

/** Operator and house balances (yoctoNEAR strings) with low-balance flags. */
export async function GET(): Promise<Response> {
  try {
    return Response.json(await houseStatus());
  } catch (e) {
    if (e instanceof ChainError) return Response.json({ error: e.message, code: "chain_down" }, { status: 503 });
    throw e;
  }
}

export const runtime = "nodejs";
