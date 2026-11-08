/**
 * Groq's OpenAI-compatible chat API, JSON mode only. Server-side: reads
 * GROQ_API_KEY from the environment, so import it from route handlers only.
 */

const URL = "https://api.groq.com/openai/v1/chat/completions";

export const MODELS = {
  /** The player's agent. */
  agent: "openai/gpt-oss-120b",
  /** The house — smaller and faster, separate rate limit. */
  house: "openai/gpt-oss-20b",
} as const;

export type Message = { role: "system" | "user"; content: string };

export class GroqError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GroqError";
  }
}

export const hasGroqKey = () => Boolean(process.env.GROQ_API_KEY);

type Options = {
  model: string;
  messages: Message[];
  maxTokens?: number;
  retries?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const RETRYABLE = new Set([429, 500, 502, 503]);

/** One JSON-mode completion, parsed. Retries rate limits and server errors with backoff. */
export async function chatJson<T = unknown>({
  model,
  messages,
  maxTokens = 400,
  retries = 2,
  fetch: f = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}: Options): Promise<T> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new GroqError("GROQ_API_KEY is not set", 401);

  for (let attempt = 0; ; attempt++) {
    const res = await f(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" },
        max_completion_tokens: maxTokens,
        reasoning_effort: "low",
        temperature: 0.7,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      try {
        return JSON.parse(content) as T;
      } catch {
        throw new GroqError("Model returned invalid JSON", 422);
      }
    }

    if (!RETRYABLE.has(res.status) || attempt >= retries) {
      throw new GroqError(`Groq request failed (${res.status})`, res.status);
    }
    const after = Number(res.headers.get("retry-after"));
    await sleep(after > 0 ? Math.min(after, 10) * 1000 : 500 * 2 ** attempt);
  }
}
