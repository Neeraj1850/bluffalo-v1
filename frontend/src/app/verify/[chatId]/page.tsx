import Link from "next/link";
import { MODELS } from "@/lib/server/nearai";
import { verifyChat } from "@/lib/server/nearaiAttest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Standalone page (opened in a new tab from a decision) that verifies one of the
 * agent's moves ran inside an attested NEAR AI TEE, by checking the signature of
 * its completion against the model's attestation report.
 */
export default async function VerifyDecision({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const att = await verifyChat(decodeURIComponent(chatId), MODELS.agent);

  const row = (k: string, v: string) => (
    <div className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 border-b border-hair py-2.5">
      <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{k}</dt>
      <dd className="break-all font-mono text-[12px]">{v}</dd>
    </div>
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-5 py-10">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-[22px] font-bold tracking-[-0.03em]">TEE verification</span>
        <span
          className={`rounded-chip border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${
            att.verified ? "border-fg" : "border-border text-muted"
          }`}
        >
          {att.verified ? "✓ TEE attested" : "Unverified"}
        </span>
      </div>

      <p className="text-[14px] leading-normal text-muted">
        {att.verified
          ? "This decision was produced and signed inside an attested NEAR AI enclave: the response signature recovers to a signer the model’s hardware attestation vouches for — the model, not the host, made the move."
          : `This decision couldn’t be verified${att.detail ? ` (${att.detail})` : ""}. If the hand just finished, the signature may not be published yet — reload in a moment.`}
      </p>

      <dl className="flex flex-col">
        {row("Model", att.model)}
        {att.signer && row("TEE signer", att.signer)}
        {att.signatureKind && row("Signature", att.signatureKind)}
        {att.signedRequestHash && row("Request hash", att.signedRequestHash)}
        {att.signedResponseHash && row("Response hash", att.signedResponseHash)}
        {row("Completion id", att.chatId)}
      </dl>

      <div className="flex flex-col gap-2">
        <a
          href={att.verifyUrl}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[11px] uppercase tracking-[0.12em] underline underline-offset-4"
        >
          Verify the full hardware quote at NEAR’s Verification Center ↗
        </a>
        <Link href="/results" className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted underline underline-offset-4">
          Back to the result
        </Link>
      </div>
    </main>
  );
}
