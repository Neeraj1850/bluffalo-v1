import { NextResponse } from "next/server";
import { accountExists, ChainError, isAccountId } from "./near";
import { sessionAgent, sessionAgentKey, sessionFrom, sessionUser, withSession, type Session } from "./sessions";

type Ok = { session: Session; agent: string; agentKey: string; receiver: string };

/**
 * Shared checks for cash-out routes: signed in, has an agent, and a destination
 * account that exists on testnet. Returns the parts, or the response to send.
 */
export async function cashoutContext(request: Request): Promise<Ok | NextResponse> {
  const session = await sessionFrom(request);
  const fail = (error: string, status: number, code?: string) =>
    withSession(NextResponse.json(code ? { error, code } : { error }, { status }), session);

  if (!(await sessionUser(session.id))) return fail("Sign in to cash out", 401);
  const agent = await sessionAgent(session.id);
  const agentKey = await sessionAgentKey(session.id);
  if (!agent || !agentKey) return fail("Your agent has nothing to cash out", 409);

  const body = await request.json().catch(() => null);
  const receiver = body?.receiver;
  if (!isAccountId(receiver)) return fail("Enter a NEAR testnet account, like you.testnet", 400);
  try {
    if (!(await accountExists(receiver))) return fail(`${receiver} doesn’t exist on NEAR testnet`, 400);
  } catch (e) {
    if (e instanceof ChainError) return fail(e.message, 503, "chain_down");
    throw e;
  }
  return { session, agent, agentKey, receiver };
}
