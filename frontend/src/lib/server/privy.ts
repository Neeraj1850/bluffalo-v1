import { PrivyClient } from "@privy-io/node";

/**
 * Who a Privy access token belongs to. Verified server-side against the app's
 * signing key — PRIVY_VERIFICATION_KEY if set (no network), otherwise the JWKS
 * fetched from Privy and cached by the client. Never trust a user id the
 * browser sends on its own.
 */

const g = globalThis as typeof globalThis & { __npPrivy?: { key: string; client: PrivyClient } };

/** The Privy user id (did:privy:…), or null if the token is invalid or expired. */
export async function verifyPrivyToken(token: string): Promise<string | null> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) throw new Error("NEXT_PUBLIC_PRIVY_APP_ID / PRIVY_APP_SECRET are not set");
  // Env files often store the PEM on one line with literal "\n".
  const jwtVerificationKey = process.env.PRIVY_VERIFICATION_KEY?.replace(/\\n/g, "\n") || undefined;
  const key = `${appId}|${jwtVerificationKey ?? ""}`;
  if (g.__npPrivy?.key !== key) {
    g.__npPrivy = { key, client: new PrivyClient({ appId, appSecret, jwtVerificationKey }) };
  }
  try {
    return (await g.__npPrivy.client.utils().auth().verifyAccessToken(token)).user_id;
  } catch {
    return null;
  }
}
