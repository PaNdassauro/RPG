/**
 * Anthropic provider via raw fetch + SSE parser. Avoids the @anthropic-ai/sdk
 * weight (≈80 KB) and its browser-only friction. Streams text deltas.
 *
 * Requires `anthropic-dangerous-direct-browser-access: true` because we are
 * calling the API from the browser. The user is warned about this in the
 * Settings UI.
 */
import { z } from "zod";
import { t } from "@/i18n";
import type {
  CompletionArgs,
  LLMProvider,
  NormalizedMessage,
  StreamEvent,
  SystemPart,
} from "../provider";
import { readSseEvents } from "../sse";
import {
  describeHttpError,
  describeNetworkError,
  fetchWithRetry,
  isAbortError,
} from "./http";

export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";
export const CLAUDE_MODEL_OPTIONS = [
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 (recommended)" },
  { id: "claude-opus-5-5", label: "Opus 5.5 (richest prose, slowest)" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5 (fastest, lightest)" },
  { id: "claude-fable-5-1", label: "Fable 5.1 (most capable, slowest, 5× Sonnet price)" },
] as const;

export function isKnownClaudeModel(id: string): boolean {
  return CLAUDE_MODEL_OPTIONS.some((m) => m.id === id);
}

/** Default output cap. Thinking tokens count toward it, so leave headroom. */
const DEFAULT_MAX_TOKENS = 8192;

interface AnthropicConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

type StopReasonOut = "stop" | "tool_calls" | "length" | "refusal";

export function mapAnthropicStopReason(reason: string | null | undefined): StopReasonOut {
  switch (reason) {
    case "max_tokens":
      return "length";
    case "refusal":
      return "refusal";
    case "tool_use":
      return "tool_calls";
    default:
      // end_turn, stop_sequence, pause_turn, or absent.
      return "stop";
  }
}

/**
 * Request fields that keep latency low. Both are documented request shapes:
 * `output_config.effort` (GA) and `thinking: between_tools` (Sonnet 5.5 only;
 * it takes no other field and requires effort <= high, which is its default).
 * Opus 5.5, Fable 5.1 and Haiku 5.5 can't turn thinking off, so they run at
 * low effort instead. Other models get nothing extra — unknown fields are a 400.
 */
export function modelRequestExtras(model: string): Record<string, unknown> {
  if (
    model.startsWith("claude-opus-5-5") ||
    model.startsWith("claude-fable-5-1") ||
    model.startsWith("claude-haiku-5-5")
  ) {
    return { output_config: { effort: "low" } };
  }
  if (model.startsWith("claude-sonnet-5-5")) return { thinking: { type: "between_tools" } };
  return {};
}

interface TextBlockParam {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral"; ttl: "1h" };
}

/**
 * One-hour cache on every breakpoint. A long session pauses for longer than the
 * default five minutes between turns, and longer-TTL entries must come before
 * shorter ones, which holds because every breakpoint (system, then history)
 * uses the same TTL.
 */
const EPHEMERAL = { type: "ephemeral", ttl: "1h" } as const;

function systemBlocks(system: string | SystemPart[]): TextBlockParam[] {
  const parts: SystemPart[] = typeof system === "string" ? [{ text: system, cache: true }] : system;
  return parts
    .filter((p) => p.text.length > 0)
    .map((p) => ({
      type: "text" as const,
      text: p.text,
      ...(p.cache ? { cache_control: EPHEMERAL } : {}),
    }));
}

function messageParam(m: NormalizedMessage): {
  role: "user" | "assistant";
  content: string | TextBlockParam[];
} {
  const role = m.role === "assistant" ? "assistant" : "user";
  if (!m.cache) return { role, content: m.content };
  return {
    role,
    content: [{ type: "text", text: m.content, cache_control: EPHEMERAL }],
  };
}

/** Pure request-body builder (exported for tests). */
export function buildAnthropicBody(
  args: CompletionArgs,
  model: string,
  maxTokens: number,
): Record<string, unknown> {
  return {
    model,
    system: systemBlocks(args.system),
    messages: args.messages.map(messageParam),
    max_tokens: maxTokens,
    stream: true,
    ...modelRequestExtras(model),
  };
}

const UsageSchema = z
  .object({
    input_tokens: z.number().nullable().optional(),
    cache_creation_input_tokens: z.number().nullable().optional(),
    cache_read_input_tokens: z.number().nullable().optional(),
  })
  .passthrough();

const StreamEventSchema = z
  .object({
    type: z.string(),
    message: z.object({ usage: UsageSchema.optional() }).passthrough().optional(),
    usage: UsageSchema.optional(),
    delta: z
      .object({
        type: z.string().optional(),
        text: z.string().optional(),
        stop_reason: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
    error: z
      .object({ type: z.string().optional(), message: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const PROVIDER_NAME = "Anthropic";

export function createAnthropicProvider(config: AnthropicConfig): LLMProvider {
  const model = config.model ?? DEFAULT_CLAUDE_MODEL;
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;

  return {
    id: "claude",
    displayName: "Anthropic Claude",
    supportsTools: true,
    supportsPromptCaching: true,
    streamCompletion: async function* (
      args: CompletionArgs,
    ): AsyncIterable<StreamEvent> {
      if (args.signal?.aborted) {
        yield { kind: "done", reason: "aborted" };
        return;
      }

      let response: Response;
      try {
        response = await fetchWithRetry(
          "https://api.anthropic.com/v1/messages",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": config.apiKey,
              "anthropic-version": "2023-06-01",
              "anthropic-dangerous-direct-browser-access": "true",
            },
            body: JSON.stringify(buildAnthropicBody(args, args.model ?? model, maxTokens)),
          },
          args.signal,
        );
      } catch (err) {
        if (args.signal?.aborted || isAbortError(err)) {
          yield { kind: "done", reason: "aborted" };
          return;
        }
        console.error("[ai/anthropic] network error", err);
        yield { kind: "error", message: describeNetworkError(err, PROVIDER_NAME) };
        yield { kind: "done", reason: "error" };
        return;
      }

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => "");
        console.error(`[ai/anthropic] HTTP ${response.status}`, text);
        yield {
          kind: "error",
          message: describeHttpError(response.status, text, PROVIDER_NAME),
        };
        yield { kind: "done", reason: "error" };
        return;
      }

      let stopReason: string | null = null;
      const usage = { read: 0, created: 0, input: 0 };
      let usageSeen = false;
      let usageLogged = false;
      const noteUsage = (u: z.infer<typeof UsageSchema> | undefined) => {
        if (!u) return;
        // message_delta repeats totals, so later values replace earlier ones.
        if (u.cache_read_input_tokens != null) usage.read = u.cache_read_input_tokens;
        if (u.cache_creation_input_tokens != null) usage.created = u.cache_creation_input_tokens;
        if (u.input_tokens != null) usage.input = u.input_tokens;
        usageSeen = true;
      };
      const logUsage = () => {
        if (usageLogged || !usageSeen) return;
        usageLogged = true;
        console.info("[anthropic] cache", { ...usage });
      };
      try {
        for await (const sse of readSseEvents(response.body)) {
          if (sse.data === "[DONE]") continue;
          let json: unknown;
          try {
            json = JSON.parse(sse.data);
          } catch {
            continue;
          }
          const parsed = StreamEventSchema.safeParse(json);
          if (!parsed.success) continue;
          const event = parsed.data;

          if (event.type === "message_start") {
            noteUsage(event.message?.usage);
          } else if (event.type === "content_block_delta") {
            if (event.delta?.type === "text_delta" && typeof event.delta.text === "string") {
              yield { kind: "text", delta: event.delta.text };
            }
          } else if (event.type === "message_delta") {
            if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
            noteUsage(event.usage);
          } else if (event.type === "message_stop") {
            logUsage();
            yield { kind: "done", reason: mapAnthropicStopReason(stopReason) };
            return;
          } else if (event.type === "error") {
            const overloaded = event.error?.type === "overloaded_error";
            console.error("[ai/anthropic] stream error", event.error);
            yield {
              kind: "error",
              message: overloaded
                ? t("settings.errors.overloaded", { provider: PROVIDER_NAME })
                : (event.error?.message ?? t("settings.errors.streamFailed", { provider: PROVIDER_NAME })),
            };
            yield { kind: "done", reason: "error" };
            return;
          }
        }
      } catch (err) {
        if (args.signal?.aborted || isAbortError(err)) {
          yield { kind: "done", reason: "aborted" };
          return;
        }
        console.error("[ai/anthropic] stream read failed", err);
        yield { kind: "error", message: describeNetworkError(err, PROVIDER_NAME) };
        yield { kind: "done", reason: "error" };
        return;
      }

      logUsage();
      if (args.signal?.aborted) {
        yield { kind: "done", reason: "aborted" };
        return;
      }
      // The stream closed without message_stop: the reply may be cut short.
      if (stopReason !== null) {
        yield { kind: "done", reason: mapAnthropicStopReason(stopReason) };
        return;
      }
      yield {
        kind: "error",
        message: t("settings.errors.streamEnded", { provider: PROVIDER_NAME }),
      };
      yield { kind: "done", reason: "error" };
    },
  };
}
