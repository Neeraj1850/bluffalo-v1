import { vi } from "vitest";

/** A stand-in for NEAR AI's chat endpoint that always answers with `content` (a fresh Response per call). */
export const fakeNearAi = (content: unknown) =>
  vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 }),
  );
