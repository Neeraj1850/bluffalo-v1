import { NextResponse } from "next/server";
import { createDeal } from "@/lib/server/deals";

/** Commit to a hand before it's dealt. Returns the hash only — never the seed. */
export async function POST() {
  return NextResponse.json(await createDeal());
}
