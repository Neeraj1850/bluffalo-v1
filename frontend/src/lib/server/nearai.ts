/**
 * NEAR AI Cloud's OpenAI-compatible chat API, JSON mode only. Server-side:
 * reads NEAR_AI_API_KEY from the environment, so import it from route handlers
 * only. Defaults to TEE-attested (verifiable) models for provable fairness;
 * override the IDs with env vars (see GET https://cloud-api.near.ai/v1/models).
 */

const URL = "https://cloud-api.near.ai/v1/chat/completions";

// TEE-attested and fast with thinking off: ~1 s a move on a real prompt, vs 12 s
// (up to 28 s) for glm-5.3-flash, whose long reasoning also truncated JSON replies.
const DEFAULT_MODEL = "Qwen/Qwen3.6-35B-A3B-FP8";

export const MODELS = {
  /** The player's agent. */
  agent: process.env.NEAR_AI_AGENT_MODEL || DEFAULT_MODEL,
  /** The house. */
  house: process.env.NEAR_AI_HOUSE_MODEL || DEFAULT_MODEL,
} as const;

export type Message = { role: "system" | "user"; content: string };

export class NearAiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "NearAiError";
  }
}

export const hasNearAiKey = () => Boolean(process.env.NEAR_AI_API_KEY);

type Options = {
  model: string;
  messages: Message[];
  maxTokens?: number;
  retries?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

// A healthy move takes 1–3 s with thinking off; this only catches a reply that never comes.
const TIMEOUT_MS = 30_000;
const RETRYABLE = new Set([429, 500, 502, 503]);

/** One JSON-mode completion, parsed. Retries rate limits and server errors with backoff. */
export async function chatJson<T = unknown>(opts: Options): Promise<T> {
  return (await chatJsonId<T>(opts)).value;
}

/**
 * Like `chatJson`, but also returns the completion `id` — the chat id NEAR AI
 * signs, so a decision can later be checked against the model's TEE attestation.
 */
export async function chatJsonId<T = unknown>({
  model,
  messages,
  maxTokens = 400,
  retries = 2,
  fetch: f = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}: Options): Promise<{ value: T; id: string }> {
  const key = process.env.NEAR_AI_API_KEY;
  if (!key) throw new NearAiError("NEAR_AI_API_KEY is not set", 401);

  for (let attempt = 0; ; attempt++) {
    const res = await f(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        temperature: 0.7,
        // Poker moves need a short JSON answer, not a reasoning trace: thinking
        // made replies 10x slower and often cut the JSON off at max_tokens.
        chat_template_kwargs: { enable_thinking: false },
      }),
      // A reply that never comes would hang the hand with stakes locked on-chain;
      // timing out turns it into "service down" and the hand gets cancelled.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      try {
        return { value: JSON.parse(content) as T, id: String(data?.id ?? "") };
      } catch {
        throw new NearAiError("Model returned invalid JSON", 422);
      }
    }

    if (!RETRYABLE.has(res.status) || attempt >= retries) {
      throw new NearAiError(`NEAR AI request failed (${res.status})`, res.status);
    }
    const after = Number(res.headers.get("retry-after"));
    await sleep(after > 0 ? Math.min(after, 10) * 1000 : 500 * 2 ** attempt);
  }
}
