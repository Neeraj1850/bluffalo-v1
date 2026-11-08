import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatJson, GroqError } from "@/lib/server/groq";

const ok = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const fail = (status: number, retryAfter?: string) =>
  new Response("{}", { status, headers: retryAfter ? { "retry-after": retryAfter } : {} });

const base = { model: "m", messages: [{ role: "user" as const, content: "hi" }] };

describe("chatJson", () => {
  beforeEach(() => vi.stubEnv("GROQ_API_KEY", "test-key"));
  afterEach(() => vi.unstubAllEnvs());

  it("sends a JSON-mode request with the key and parses the reply", async () => {
    const f = vi.fn().mockResolvedValue(ok('{"action":"call"}'));
    await expect(chatJson({ ...base, fetch: f })).resolves.toEqual({ action: "call" });
    const [, init] = f.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toMatchObject({ model: "m", response_format: { type: "json_object" } });
  });

  it("retries rate limits, honouring retry-after", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const f = vi.fn().mockResolvedValueOnce(fail(429, "2")).mockResolvedValueOnce(ok("{}"));
    await chatJson({ ...base, fetch: f, sleep });
    expect(f).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("backs off exponentially without retry-after", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const f = vi.fn().mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok("{}"));
    await chatJson({ ...base, fetch: f, sleep });
    expect(sleep.mock.calls).toEqual([[500], [1000]]);
  });

  it("gives up after the retry budget", async () => {
    const f = vi.fn().mockResolvedValue(fail(429));
    await expect(chatJson({ ...base, fetch: f, sleep: async () => {}, retries: 1 })).rejects.toMatchObject({
      status: 429,
    });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does not retry client errors", async () => {
    const f = vi.fn().mockResolvedValue(fail(400));
    await expect(chatJson({ ...base, fetch: f })).rejects.toBeInstanceOf(GroqError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid JSON from the model", async () => {
    const f = vi.fn().mockResolvedValue(ok("not json"));
    await expect(chatJson({ ...base, fetch: f })).rejects.toMatchObject({ message: "Model returned invalid JSON", status: 422 });
  });

  it("fails fast without a key", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const f = vi.fn();
    await expect(chatJson({ ...base, fetch: f })).rejects.toThrow("GROQ_API_KEY");
    expect(f).not.toHaveBeenCalled();
  });
});
