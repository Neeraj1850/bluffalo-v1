import { NextResponse } from "next/server";
import { PRESETS } from "@/lib/data/strategy";
import { getTable, TABLES } from "@/lib/data/tables";
import { ensureRunning, getAutoplay, isRunning, resumeAll, startAutoplay, stopAutoplay } from "@/lib/server/autoplay";
import { parseParams } from "@/lib/server/play";
import { sessionAgent, sessionFrom, sessionUser, withSession } from "@/lib/server/sessions";

/**
 * Server autoplay ("Keep playing when I close the tab"). Off by default.
 * GET: whether it's on/running, its totals, and why it stopped.
 * POST {on:false}: stop after the current hand.
 * POST {on:true, tableId, params, preset?, runId, limits, stack, hands?, net?}: start
 * (hands/net: the sitting so far in the browser, so its limits keep counting).
 */
export async function GET(request: Request) {
  const session = await sessionFrom(request);
  void resumeAll();
  const ap = await getAutoplay(session.id);
  if (ap.on) ensureRunning(session.id); // lazy resume after a restart
  return withSession(NextResponse.json({ ...ap, running: ap.on || isRunning(session.id) }), session);
}

export async function POST(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.on !== "boolean") return reply({ error: "Send on: true or false" }, 400);
  if (!(await sessionUser(session.id))) return reply({ error: "Sign in to play for real money" }, 401);
  if (!b.on) {
    await stopAutoplay(session.id);
    return reply({ on: false });
  }
  if (!(await sessionAgent(session.id))) return reply({ error: "Deploy an agent first" }, 409);
  if (typeof b.tableId !== "string" || !TABLES.some((t) => t.id === b.tableId) || getTable(b.tableId).mode !== "real") {
    return reply({ error: "Autoplay is for real-money tables" }, 400);
  }
  const params = parseParams(b.params);
  if (typeof params === "string") return reply({ error: params }, 400);
  if (typeof b.runId !== "string" || !/^[0-9a-f]{8,32}$/.test(b.runId)) return reply({ error: "Invalid runId" }, 400);
  const l = b.limits as Record<string, unknown> | null;
  const num = (v: unknown) => typeof v === "number" && v > 0 && v <= 1e6;
  if (!l || !num(l.stopLoss) || !num(l.takeProfit) || !num(l.maxHands)) return reply({ error: "Invalid limits" }, 400);
  if (!num(b.stack)) return reply({ error: "Invalid stack" }, 400);
  const hands = b.hands ?? 0;
  const net = b.net ?? 0;
  if (typeof hands !== "number" || !Number.isInteger(hands) || hands < 0 || typeof net !== "number" || !Number.isFinite(net)) {
    return reply({ error: "Invalid sitting totals" }, 400);
  }
  const preset = PRESETS.find((x) => x.key === b.preset)?.key;
  await startAutoplay(session.id, {
    tableId: b.tableId,
    params,
    ...(preset ? { preset } : {}),
    runId: b.runId,
    limits: { stopLoss: l.stopLoss as number, takeProfit: l.takeProfit as number, maxHands: l.maxHands as number },
    stack: b.stack as number,
    hands,
    net,
  });
  return reply({ on: true });
}
