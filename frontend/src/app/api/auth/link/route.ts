import { NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/server/privy";
import { linkUser, sessionFrom, withSession } from "@/lib/server/sessions";

/**
 * After a Privy login: verify the access token, then tie this browser to the
 * user's session. Returns that session's saved setup.
 */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const userId = token ? await verifyPrivyToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Sign-in could not be verified" }, { status: 401 });

  const current = await sessionFrom(request);
  const session = await linkUser(current.id, userId);
  return withSession(NextResponse.json({ state: session.state }), session);
}
