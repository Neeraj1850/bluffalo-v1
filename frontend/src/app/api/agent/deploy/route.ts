import { NextResponse } from "next/server";
import { defaultBuyIn, TABLES } from "@/lib/data/tables";
import { newSeed } from "@/lib/poker/fairness";
import { tableFeeFor, TABLE_CLOSED, tableStatus } from "@/lib/server/economics";
import {
  ChainError,
  createAgentAccount,
  depositFromWallet,
  houseBalance,
  sendFromWallet,
  toYocto,
  walletBalanceYocto,
} from "@/lib/server/near";
import { saveState, sessionFrom, sessionUser, sessionWallet, setSessionAgent, withSession } from "@/lib/server/sessions";

/**
 * Deploy an agent for real money: a fresh NEAR testnet sub-account (created by
 * the operator), funded in the poker contract with the table's buy-in (scaled
 * for testnet) from the player's own deposit wallet, then the disclosed table
 * fee (TABLE_FEE_PCT of the buy-in) to the operator's treasury. The account
 * is remembered server-side — the browser can't point play at someone else's.
 */
export async function POST(request: Request) {
  const session = await sessionFrom(request);
  const reply = (body: unknown, status = 200) => withSession(NextResponse.json(body, { status }), session);

  if (!(await sessionUser(session.id))) return reply({ error: "Sign in to deploy an agent" }, 401);
  const body = await request.json().catch(() => null);
  const table = TABLES.find((t) => t.id === body?.tableId);
  if (!table || table.mode !== "real") return reply({ error: "Pick a real-money table" }, 400);

  const wallet = await sessionWallet(session.id);
  const insufficient = () =>
    reply({ error: "Not enough playing balance — deposit first", code: "insufficient_funds" }, 402);
  if (!wallet) return insufficient();

  try {
    const status = tableStatus(table, await houseBalance());
    if (!status.open) return reply(TABLE_CLOSED, 503);
    const buyIn = Math.min(defaultBuyIn(table), status.maxBuyIn);
    const tableFee = tableFeeFor(buyIn);
    if ((await walletBalanceYocto(wallet.account)) < toYocto(buyIn) + toYocto(tableFee)) return insufficient();
    const { accountId: agentAccount, privateKey } = await createAgentAccount();
    const depositTx = await depositFromWallet(wallet.account, wallet.key, agentAccount, buyIn);
    // The token the player's external agent uses to connect to the MCP server as this agent.
    const mcpToken = newSeed() + newSeed(); // 64 hex
    await setSessionAgent(session.id, agentAccount, privateKey, mcpToken);
    // Record "deployed" server-side too: the browser's debounced save can be lost
    // if the player navigates or reloads right away, which put the game in practice mode.
    const confirmedAt = Date.now();
    await saveState(session.id, {
      ...session.state,
      tableId: table.id,
      agent: { status: "deployed", account: agentAccount, buyIn, tableId: table.id, at: confirmedAt },
    });
    // The fee is charged only once the agent holds its buy-in (and is saved). If it
    // fails, the house forgoes it rather than leave the funded agent unrecorded.
    let feeTx: string | null = null;
    if (tableFee > 0) {
      feeTx = await sendFromWallet(wallet.account, wallet.key, process.env.NEAR_OPERATOR_ID!, toYocto(tableFee)).catch(
        (err) => (console.error("[deploy] table fee failed", agentAccount, err), null),
      );
    }
    return reply({ agentAccount, depositTx, buyIn, tableFee, feeTx, mcpToken, confirmedAt });
  } catch (e) {
    if (e instanceof ChainError) return reply({ error: e.message, code: "chain_down" }, 503);
    throw e;
  }
}
