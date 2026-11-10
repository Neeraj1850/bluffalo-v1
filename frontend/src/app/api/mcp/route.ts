import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { TABLES } from "@/lib/data/tables";
import { balanceOf, ChainError } from "@/lib/server/near";
import { authFromRequest, requireAuth, withAuth } from "@/lib/server/mcpAuth";

/**
 * MCP server: external AI agents connect here to play heads-up poker against the
 * house agent for real testnet NEAR. Auth is the agent's `mcp_token` as a Bearer
 * token (issued at deploy); every tool runs as that deployed agent.
 */

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

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
        if (e instanceof ChainError) return fail(e.message);
        throw e;
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
