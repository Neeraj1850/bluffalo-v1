import { PrivyClient } from "@privy-io/node";

/**
 * Who a Privy access token belongs to. Verified server-side against the
 * app's signing keys (fetched from Privy, cached by the client) — never
 * trust a user id the browser sends on its own.
 */

const g = globalThis as typeof globalThis & { __npPrivy?: PrivyClient };

/** The Privy user id (did:privy:…), or null if the token is invalid or expired. */
export async function verifyPrivyToken(token: string): Promise<string | null> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) throw new Error("NEXT_PUBLIC_PRIVY_APP_ID / PRIVY_APP_SECRET are not set");
  g.__npPrivy ??= new PrivyClient({ appId, appSecret });
  try {
    return (await g.__npPrivy.utils().auth().verifyAccessToken(token)).user_id;
  } catch {
    return null;
  }
}
