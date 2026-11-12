"use client";

import { useEffect, useState } from "react";
import { Disclosure } from "@/components/ui/Disclosure";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { housePeek, type PeekCheck } from "@/lib/poker/housePeek";
import type { HousePrompt } from "@/lib/poker/record";
import { type Attestation, fetchAttestation } from "@/services/agentApi";

/** The messages text of a stored request body, for reading; the raw body is what's hashed. */
function readable(prompt: string): string {
  try {
    const { messages } = JSON.parse(prompt) as { messages: { role: string; content: string }[] };
    return messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n");
  } catch {
    return prompt;
  }
}

/**
 * "The TEE is the dealer's referee": every house prompt is re-hashed in the
 * browser, matched to the request hash NEAR AI signed inside its TEE, and
 * searched for the player's hole cards (derived from the revealed seeds).
 */
export function HouseProofCard({ prompts, seed, playerSeed }: { prompts: HousePrompt[]; seed: string; playerSeed: string }) {
  const [checks, setChecks] = useState<PeekCheck[] | null>(null);
  const [att, setAtt] = useState<Attestation | null>(null);
  const chats = prompts.flatMap((p) => (p.chatId ? [p.chatId] : [])).join(",");

  useEffect(() => {
    let cancelled = false;
    housePeek(prompts, seed, playerSeed).then((c) => !cancelled && setChecks(c));
    if (chats) fetchAttestation(chats.split(","), fetch, "house").then((a) => !cancelled && setAtt(a));
    return () => {
      cancelled = true;
    };
  }, [prompts, seed, playerSeed, chats]);

  const signed = (p: HousePrompt) =>
    att?.requests?.find((r) => r.chatId === p.chatId && r.verified)?.signedRequestHash === p.requestHash;
  const loading = !checks || (Boolean(chats) && !att);
  const passed = checks ? prompts.filter((p, i) => checks[i].ok && signed(p)).length : 0;
  const all = !loading && passed === prompts.length;

  return (
    <section aria-label="House never saw your cards" aria-live="polite" className="flex flex-col gap-2 rounded-card border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge kind={loading ? "verifying" : all ? "verified" : "unverified"}>
          {loading ? "Checking house prompts…" : `${passed}/${prompts.length} house prompts verified`}
        </StatusBadge>
        <MonoLabel tone="muted">Dealer’s referee</MonoLabel>
      </div>
      <p className="text-[13px] leading-normal text-muted">
        {all
          ? "House never saw your cards. Each prompt the house AI got matches the request NEAR AI signed inside its TEE, and none of them contain your hole cards."
          : loading
            ? "Re-hashing every house prompt and matching it to the TEE-signed request…"
            : "Some house prompts couldn’t be proven. See each decision below."}
      </p>
      {checks && (
        <Disclosure hint="Details" summary={<MonoLabel>Every house prompt</MonoLabel>}>
          <ol className="flex flex-col gap-4 pb-1">
            {prompts.map((p, i) => (
              <li key={p.requestHash + i} className="flex flex-col gap-1.5 font-mono text-[11px]">
                <MonoLabel tone="muted">
                  {i + 1}. {p.street}
                </MonoLabel>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-[8px] border border-dashed border-border p-2 text-[11px]">
                  {readable(p.prompt)}
                </pre>
                <span className="break-all text-muted">SHA-256 {checks[i].hash}</span>
                <span>
                  {signed(p) ? "✓ Matches TEE-signed request" : "✕ Not matched to a TEE-signed request"} ·{" "}
                  {checks[i].ok ? "✓ " : "✕ "}
                  {checks[i].reason}
                </span>
              </li>
            ))}
          </ol>
        </Disclosure>
      )}
    </section>
  );
}
