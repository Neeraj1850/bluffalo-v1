import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getTable, TABLES } from "@/lib/data/tables";
import { shuffle } from "@/lib/poker/deck";
import { mixSeed } from "@/lib/poker/fairness";
import { createDeal, takeSeed } from "@/lib/server/deals";
import { ServiceDownError } from "@/lib/server/decide";
import {
  applyExternalAction,
  IllegalMoveError,
  NotYourTurnError,
  startHand,
  UnknownHandError,
} from "@/lib/server/liveHand";
import { sessionPayoutCap, stakeFor, TABLE_CLOSED, tableStatus } from "@/lib/server/economics";
import { balanceOf, cancelHand, ChainError, commitHand, houseBalance } from "@/lib/server/near";
import { authFromRequest, requireAuth, withAuth } from "@/lib/server/mcpAuth";
import { liveDeps, mapAction } from "@/lib/server/mcpPlay";

/**
 * MCP server: external AI agents connect here to play heads-up poker against the
 * house agent for real testnet NEAR. Auth is the agent's `mcp_token` as a Bearer
 * token (issued at deploy); every tool runs as that deployed agent. The agent is
 * seat 0 and acts one `act` call at a time; the house replies synchronously.
 */

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

/** Turn an expected machine error into a tool failure; rethrow anything else. */
function toFail(e: unknown) {
  if (
    e instanceof ServiceDownError ||
    e instanceof ChainError ||
    e instanceof UnknownHandError ||
    e instanceof NotYourTurnError ||
    e instanceof IllegalMoveError
  ) {
    return fail(e.message);
  }
  throw e;
}

const mcp = createMcpHandler((server) => {
  server.registerTool(
    "get_table",
    {
      title: "Get tables",
      description: "List the real-money tables and your agent's current on-chain balance (table NEAR).",
      inputSchema: z.object({}),
    },
    async () => {
      const { agent } = requireAuth();
      try {
        const balance = await balanceOf(agent);
        const tables = TABLES.filter((t) => t.mode === "real").map((t) => ({
          id: t.id,
          name: t.name,
          blinds: t.blinds,
          buyIn: t.buyIn,
          level: t.levelLabel,
        }));
        return text({ agent, balance, tables });
      } catch (e) {
        return toFail(e);
      }
    },
  );

  server.registerTool(
    "deal",
    {
      title: "Deal a hand",
      description:
        "Start a real-money hand at a table. Your whole on-chain balance is the stack; the house matches it. " +
        "`playerSeed` is 32 lowercase hex chars you pick — it's mixed into the shuffle so the deal is provably fair. " +
        "Returns the hand id and your first decision (or the result if the hand ends before you act).",
      inputSchema: z.object({
        tableId: z.string(),
        playerSeed: z.string().regex(/^[0-9a-f]{32}$/, "playerSeed must be 32 lowercase hex chars"),
      }),
    },
    async ({ tableId, playerSeed }) => {
      const { sessionId, agent } = requireAuth();
      const table = getTable(tableId);
      if (table.mode !== "real") return fail("That table isn't a real-money table");
      try {
        // Same disclosed bankroll limits as /api/play: closed tables, session cap, exposure cap.
        const [balance, house] = await Promise.all([balanceOf(agent), houseBalance()]);
        if (!tableStatus(table, house).open) return fail(TABLE_CLOSED.error);
        if (balance >= sessionPayoutCap(table, house)) return fail("Your agent hit this table's session limit — cash out to keep playing");
        const stack = stakeFor(balance, house);
        if (stack < table.blinds.big) return fail("Your agent is out of chips at this table");

        const { handId } = await createDeal(sessionId);
        const claimed = await takeSeed(handId, sessionId);
        if (!claimed) return fail("Could not claim the deal — try again");

        const commitTx = await commitHand(handId, agent, claimed.commitment, stack);
        const deck = shuffle(await mixSeed(claimed.seed, playerSeed));
        try {
          const result = await startHand(liveDeps, {
            handId,
            sessionId,
            tableName: table.name,
            deck,
            stacks: [stack, stack],
            blinds: table.blinds,
            button: 0,
            deal: { seed: claimed.seed, commitment: claimed.commitment, playerSeed },
            agent,
            commitTx,
          });
          return text({ handId, ...result });
        } catch (e) {
          // Committed on-chain but the hand never got going (house model down): refund.
          await cancelHand(handId).catch(() => {});
          throw e;
        }
      } catch (e) {
        return toFail(e);
      }
    },
  );

  server.registerTool(
    "act",
    {
      title: "Act in a hand",
      description:
        "Make your move in a hand from `deal`. `action` is fold | check | call | raise. For raise, pass `amount` " +
        "(your total bet this street, within the legal min/max from the last view). `reason` is optional. " +
        "Returns your next decision, or the finished hand once it's over.",
      inputSchema: z.object({
        handId: z.string().regex(/^[0-9a-f]{8}$/),
        action: z.enum(["fold", "check", "call", "raise"]),
        amount: z.number().optional(),
        reason: z.string().optional(),
      }),
    },
    async ({ handId, action, amount, reason }) => {
      const { sessionId } = requireAuth();
      const move = mapAction(action, amount);
      if (typeof move === "string") return fail(move);
      try {
        // Ownership: a token may only act on its own session's hands.
        const rec = await liveDeps.store.get(handId);
        if (!rec || rec.sessionId !== sessionId) return fail(new UnknownHandError().message);
        const result = await applyExternalAction(liveDeps, handId, move, reason);
        return text({ handId, ...result });
      } catch (e) {
        return toFail(e);
      }
    },
  );
});

/** Resolve the Bearer token to the deployed agent, then run the MCP handler as that agent. */
async function route(request: Request): Promise<Response> {
  const auth = await authFromRequest(request);
  if (!auth) {
    return Response.json(
      { error: "Connect with your agent's MCP token as a Bearer token. Deploy an agent to get one." },
      { status: 401 },
    );
  }
  return withAuth(auth, () => mcp(request));
}

export { route as GET, route as POST, route as DELETE };
export const runtime = "nodejs";
