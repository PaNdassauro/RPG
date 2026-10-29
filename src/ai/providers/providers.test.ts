import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocaleStore } from "@/i18n";
import type { ApiKeyRecord } from "@/db/schema";
import type { StreamEvent } from "../provider";
import {
  buildAnthropicBody,
  createAnthropicProvider,
  mapAnthropicStopReason,
  modelRequestExtras,
} from "./anthropic";
import {
  createOpenAIProvider,
  mapOpenAiFinishReason,
  normalizeOpenAiBaseUrl,
} from "./openai";
import { retryDelayMs } from "./http";
import { createProviderFromRecord } from "./index";
import { migrateRecord } from "@/state/keysStore";

const encoder = new TextEncoder();

function sseResponse(chunks: string[], init: ResponseInit = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status: 200, ...init });
}

async function drain(iter: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

function anthropicSse(stopReason: string, text = "Hi"): string[] {
  return [
    `event: message_start\r\ndata: {"type":"message_start"}\r\n\r\n`,
    `event: content_block_delta\r\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"${text}"}}\r\n\r\n`,
    `event: message_delta\r\ndata: {"type":"message_delta","delta":{"stop_reason":"${stopReason}"}}\r\n\r\n`,
    `event: message_stop\r\ndata: {"type":"message_stop"}\r\n\r\n`,
  ];
}

const baseArgs = {
  system: "sys",
  messages: [{ role: "user" as const, content: "hello" }],
  tools: [],
};

beforeEach(() => {
  useLocaleStore.setState({ locale: "en" });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("stop reason mapping", () => {
  it("maps Anthropic stop reasons", () => {
    expect(mapAnthropicStopReason("max_tokens")).toBe("length");
    expect(mapAnthropicStopReason("refusal")).toBe("refusal");
    expect(mapAnthropicStopReason("end_turn")).toBe("stop");
    expect(mapAnthropicStopReason("stop_sequence")).toBe("stop");
    expect(mapAnthropicStopReason(undefined)).toBe("stop");
  });

  it("maps OpenAI finish reasons", () => {
    expect(mapOpenAiFinishReason("length")).toBe("length");
    expect(mapOpenAiFinishReason("content_filter")).toBe("refusal");
    expect(mapOpenAiFinishReason("stop")).toBe("stop");
  });
});

describe("retryDelayMs", () => {
  it("honors retry-after seconds", () => {
    expect(retryDelayMs(1, "2")).toBe(2000);
    expect(retryDelayMs(1, "0")).toBe(0);
  });
  it("caps an absurd retry-after", () => {
    expect(retryDelayMs(1, "9999")).toBe(30_000);
  });
  it("falls back to exponential backoff with jitter", () => {
    expect(retryDelayMs(1, null, () => 0)).toBe(1000);
    expect(retryDelayMs(2, null, () => 0)).toBe(2000);
    expect(retryDelayMs(2, "soon", () => 0.5)).toBe(2250);
  });
});

describe("buildAnthropicBody", () => {
  it("emits one cache_control per cacheable system part and message", () => {
    const body = buildAnthropicBody(
      {
        system: [{ text: "static", cache: true }, { text: "volatile" }],
        messages: [
          { role: "user", content: "a" },
          { role: "assistant", content: "b", cache: true },
          { role: "user", content: "c" },
        ],
        tools: [],
      },
      "claude-haiku-5-5",
      4096,
    );
    expect(body.system).toEqual([
      { type: "text", text: "static", cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: "volatile" },
    ]);
    expect(body.messages).toEqual([
      { role: "user", content: "a" },
      {
        role: "assistant",
        content: [{ type: "text", text: "b", cache_control: { type: "ephemeral", ttl: "1h" } }],
      },
      { role: "user", content: "c" },
    ]);
    expect(body.max_tokens).toBe(4096);
    expect(body.stream).toBe(true);
  });

  it("sends model-specific latency fields only where documented", () => {
    expect(modelRequestExtras("claude-opus-5-5")).toEqual({ output_config: { effort: "low" } });
    expect(modelRequestExtras("claude-sonnet-5-5")).toEqual({ thinking: { type: "between_tools" } });
    expect(modelRequestExtras("claude-haiku-5-5")).toEqual({ output_config: { effort: "low" } });
    expect(modelRequestExtras("claude-fable-5-1")).toEqual({ output_config: { effort: "low" } });
    expect(modelRequestExtras("something-else")).toEqual({});
  });
});

describe("Anthropic streaming", () => {
  it("streams text over CRLF SSE and maps max_tokens to length", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(anthropicSse("max_tokens", "Hola"))));
    const events = await drain(createAnthropicProvider({ apiKey: "k" }).streamCompletion(baseArgs));
    expect(events).toEqual([
      { kind: "text", delta: "Hola" },
      { kind: "done", reason: "length" },
    ]);
  });

  it("sends the one-hour cache TTL on every breakpoint of the request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(anthropicSse("end_turn")));
    vi.stubGlobal("fetch", fetchMock);
    await drain(
      createAnthropicProvider({ apiKey: "k" }).streamCompletion({
        system: [{ text: "static", cache: true }],
        messages: [
          { role: "user", content: "a", cache: true },
          { role: "assistant", content: "b" },
          { role: "user", content: "c" },
        ],
        tools: [],
      }),
    );
    const sent = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string) as {
      system: Array<{ cache_control?: unknown }>;
      messages: Array<{ content: string | Array<{ cache_control?: unknown }> }>;
    };
    const breakpoints = [
      sent.system[0]!.cache_control,
      (sent.messages[0]!.content as Array<{ cache_control?: unknown }>)[0]!.cache_control,
    ];
    expect(breakpoints).toEqual([
      { type: "ephemeral", ttl: "1h" },
      { type: "ephemeral", ttl: "1h" },
    ]);
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(Object.keys(headers).some((h) => h.toLowerCase() === "anthropic-beta")).toBe(false);
  });

  it("logs cache usage once per request", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          `event: message_start\r\ndata: {"type":"message_start","message":{"usage":{"input_tokens":12,"cache_creation_input_tokens":300,"cache_read_input_tokens":4000}}}\r\n\r\n`,
          `event: content_block_delta\r\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\r\n\r\n`,
          `event: message_delta\r\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":9}}\r\n\r\n`,
          `event: message_stop\r\ndata: {"type":"message_stop"}\r\n\r\n`,
        ]),
      ),
    );
    await drain(createAnthropicProvider({ apiKey: "k" }).streamCompletion(baseArgs));
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith("[anthropic] cache", { read: 4000, created: 300, input: 12 });
  });

  it("maps refusal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(anthropicSse("refusal"))));
    const events = await drain(createAnthropicProvider({ apiKey: "k" }).streamCompletion(baseArgs));
    expect(events.at(-1)).toEqual({ kind: "done", reason: "refusal" });
  });

  it("reports aborted without calling fetch when the signal is already aborted", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    const events = await drain(
      createAnthropicProvider({ apiKey: "k" }).streamCompletion({ ...baseArgs, signal: controller.signal }),
    );
    expect(events).toEqual([{ kind: "done", reason: "aborted" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports aborted when the signal fires mid-stream", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(
              encoder.encode(
                'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"A"}}\n\n',
              ),
            );
            controller.signal.addEventListener("abort", () =>
              c.error(new DOMException("Aborted", "AbortError")),
            );
          },
        });
        return new Response(body, { status: 200 });
      }),
    );
    const iter = createAnthropicProvider({ apiKey: "k" })
      .streamCompletion({ ...baseArgs, signal: controller.signal })
      [Symbol.asyncIterator]();
    const first = await iter.next();
    expect(first.value).toEqual({ kind: "text", delta: "A" });
    controller.abort();
    const next = await iter.next();
    expect(next.value).toEqual({ kind: "done", reason: "aborted" });
  });

  it("retries a 429 honoring retry-after, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(sseResponse(anthropicSse("end_turn")));
    vi.stubGlobal("fetch", fetchMock);
    const events = await drain(createAnthropicProvider({ apiKey: "k" }).streamCompletion(baseArgs));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toEqual({ kind: "done", reason: "stop" });
  });

  it("gives up after three attempts and reports a friendly rate-limit message", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response("{}", { status: 429, headers: { "retry-after": "0" } }));
    vi.stubGlobal("fetch", fetchMock);
    const events = await drain(createAnthropicProvider({ apiKey: "k" }).streamCompletion(baseArgs));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(events[0]).toMatchObject({ kind: "error" });
    expect((events[0] as { message: string }).message).toMatch(/rate-limiting/);
    expect(events[1]).toEqual({ kind: "done", reason: "error" });
  });

  it("maps 401 to a bad-key message and surfaces JSON error text otherwise", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const auth = await drain(createAnthropicProvider({ apiKey: "k" }).streamCompletion(baseArgs));
    expect((auth[0] as { message: string }).message).toMatch(/rejected the API key/);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"type":"error","error":{"type":"invalid_request_error","message":"bad field"}}', {
          status: 400,
        }),
      ),
    );
    const bad = await drain(createAnthropicProvider({ apiKey: "k" }).streamCompletion(baseArgs));
    expect((bad[0] as { message: string }).message).toContain("bad field");
  });

  it("flags a stream that ends without message_stop as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse(['data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"x"}}\n\n']),
      ),
    );
    const events = await drain(createAnthropicProvider({ apiKey: "k" }).streamCompletion(baseArgs));
    expect(events.at(-1)).toEqual({ kind: "done", reason: "error" });
  });
});

describe("OpenAI-compatible streaming", () => {
  const chunk = (content: string, finish: string | null = null) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: finish }] })}\r\n\r\n`;

  it("uses max_completion_tokens and maps content_filter to refusal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse([chunk("Hi"), chunk("", "content_filter"), "data: [DONE]\r\n\r\n"]));
    vi.stubGlobal("fetch", fetchMock);
    const events = await drain(createOpenAIProvider({ apiKey: "k" }).streamCompletion(baseArgs));
    expect(events).toEqual([
      { kind: "text", delta: "Hi" },
      { kind: "done", reason: "refusal" },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(sent.max_completion_tokens).toBe(8192);
    expect(sent).not.toHaveProperty("max_tokens");
    expect(sent.model).toBe("gpt-6.1-sol");
    expect(sent.reasoning_effort).toBe("low");
  });

  it("flushes the last event at EOF when the server omits the trailing blank line", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sseResponse([chunk("A"), chunk("B", "stop").trimEnd()])),
    );
    const events = await drain(createOpenAIProvider({ apiKey: "k" }).streamCompletion(baseArgs));
    expect(events).toEqual([
      { kind: "text", delta: "A" },
      { kind: "text", delta: "B" },
      { kind: "done", reason: "stop" },
    ]);
  });

  it("concatenates system parts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([chunk("x", "stop")]));
    vi.stubGlobal("fetch", fetchMock);
    await drain(
      createOpenAIProvider({ apiKey: "k" }).streamCompletion({
        ...baseArgs,
        system: [{ text: "one", cache: true }, { text: "two" }],
      }),
    );
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const sent = JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] };
    expect(sent.messages[0]).toEqual({ role: "system", content: "one\n\ntwo" });
  });

  it("normalizes base urls", () => {
    expect(normalizeOpenAiBaseUrl("http://localhost:11434")).toBe("http://localhost:11434/v1");
    expect(normalizeOpenAiBaseUrl("http://localhost:11434/v1/")).toBe("http://localhost:11434/v1");
  });
});

describe("createProviderFromRecord", () => {
  const rec = (over: Partial<ApiKeyRecord>): ApiKeyRecord => ({
    providerId: "claude",
    key: "k",
    updatedAt: 1,
    ...over,
  });

  it("builds claude, openai and ollama providers; gemini has none", () => {
    expect(createProviderFromRecord(rec({}))?.id).toBe("claude");
    expect(createProviderFromRecord(rec({ providerId: "openai" }))?.id).toBe("openai");
    expect(createProviderFromRecord(rec({ providerId: "ollama", key: "" }))?.id).toBe("ollama");
    expect(createProviderFromRecord(rec({ providerId: "gemini" }))).toBeNull();
  });

  it("points Ollama at the local OpenAI-compatible endpoint with no auth header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([`data: [DONE]\n\n`]));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createProviderFromRecord(rec({ providerId: "ollama", key: "", model: "qwen3" }));
    await drain(provider!.streamCompletion(baseArgs));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(init.headers).not.toHaveProperty("Authorization");
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(sent.model).toBe("qwen3");
    expect(sent.max_tokens).toBe(8192);
    expect(sent).not.toHaveProperty("max_completion_tokens");
    expect(sent).not.toHaveProperty("reasoning_effort");
  });
});

describe("saved model migration", () => {
  const base: ApiKeyRecord = { providerId: "claude", key: "k", updatedAt: 1 };
  it("moves retired Claude model ids to the default", () => {
    expect(migrateRecord({ ...base, model: "claude-sonnet-4-6" }).model).toBe("claude-sonnet-5-5");
    expect(migrateRecord({ ...base, model: "claude-haiku-4-5-20251001" }).model).toBe("claude-sonnet-5-5");
  });
  it("keeps current Claude ids and custom OpenAI/Ollama ids untouched", () => {
    const current = { ...base, model: "claude-opus-5-5" };
    expect(migrateRecord(current)).toBe(current);
    const custom: ApiKeyRecord = { providerId: "openai", key: "k", model: "my-fine-tune", updatedAt: 1 };
    expect(migrateRecord(custom)).toBe(custom);
    expect(migrateRecord(base)).toBe(base);
  });
  it("moves OpenAI ids from the old GPT-4 list to the new default", () => {
    const old: ApiKeyRecord = { providerId: "openai", key: "k", model: "gpt-4o", updatedAt: 1 };
    expect(migrateRecord(old).model).toBe("gpt-6.1-sol");
    const current: ApiKeyRecord = { providerId: "openai", key: "k", model: "gpt-6-astra", updatedAt: 1 };
    expect(migrateRecord(current)).toBe(current);
  });
});
