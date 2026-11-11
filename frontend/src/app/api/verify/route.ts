import { MODELS } from "@/lib/server/nearai";
import { type Attestation, verifyModel } from "@/lib/server/nearaiAttest";

/**
 * Live TEE attestation for the agent model: proves NEAR AI Cloud ran and signed
 * the inference inside an attested enclave. Used by the Results screen to back
 * the "AI decisions run in a TEE" claim with a fresh cryptographic check.
 */
export async function GET(): Promise<Response> {
  try {
    return Response.json(await verifyModel(MODELS.agent));
  } catch {
    const body: Attestation = {
      verified: false,
      model: MODELS.agent,
      detail: "NEAR AI attestation service is unreachable",
      verifyUrl: "https://cloud.near.ai/verify",
    };
    return Response.json(body, { status: 200 });
  }
}

export const runtime = "nodejs";
