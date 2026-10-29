/**
 * OpenAI provider via raw fetch + SSE. Avoids the openai SDK weight and
 * matches the Anthropic adapter's contract so DM-loop swap is a no-op.
 *
 * The same adapter drives any OpenAI-compatible endpoint (Ollama, LM Studio,
 * proxies) by pointing `baseUrl` at it. OpenAI allows direct browser calls —
 * they send `Access-Control-Allow-Origin: *` for `/v1/chat/completions`. We
 * still warn the user about exposing the key from a browser context.
 */
import { z } from "zod";
import { t } from "@/i18n";
import {
  systemToText,
  type CompletionArgs,
  type LLMProvider,
  type ProviderId,
  type StreamEvent,
} from "../provider";
import { readSseEvents } from "../sse";
import {
  describeHttpError,
  describeNetworkError,
  fetchWithRetry,
  isAbortError,
} from "./http";

export const DEFAULT_OPENAI_MODEL = "gpt-4o";
export const OPENAI_MODEL_OPTIONS = [
  { id: "gpt-4o", label: "GPT-4o (recommended)" },
  { id: "gpt-4o-mini", label: "GPT-4o mini (fastest, cheapest)" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
] as const;

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MAX_TOKENS = 4096;

interface OpenAIConfig {
  /** Optional for local OpenAI-compatible servers (Ollama). */
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  /** Endpoint root including `/v1`. Defaults to api.openai.com. */
  baseUrl?: string;
  /**
   * OpenAI's newer models reject `max_tokens`; most compatible servers
   * (Ollama, LM Studio) only know it. Defaults to `max_completion_tokens`.
   */
  tokenParam?: "max_completion_tokens" | "max_tokens";
  /** Provider id/display name reported to the app (Ollama reuses this adapter). */
  id?: ProviderId;
  displayName?: string;
}

type DoneReason = "stop" | "tool_calls" | "length" | "refusal";

export function mapOpenAiFinishReason(reason: string): DoneReason {
  switch (reason) {
    case "length":
      return "length";
    case "content_filter":
      return "refusal";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    default:
      return "stop";
  }
}

/** Append `/v1` when the user typed a bare host, drop trailing slashes. */
export function normalizeOpenAiBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

const ChunkSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            delta: z
              .object({ content: z.string().nullable().optional() })
              .passthrough()
              .optional(),
            finish_reason: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .optional(),
    error: z.object({ message: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

export function createOpenAIProvider(config: OpenAIConfig): LLMProvider {
  const model = config.model ?? DEFAULT_OPENAI_MODEL;
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
  const tokenParam = config.tokenParam ?? "max_completion_tokens";
  const baseUrl = normalizeOpenAiBaseUrl(config.baseUrl ?? DEFAULT_OPENAI_BASE_URL);
  const displayName = config.displayName ?? "OpenAI GPT";
  const providerName = displayName;

  return {
    id: config.id ?? "openai",
    displayName,
    supportsTools: true,
    supportsPromptCaching: false,
    streamCompletion: async function* (
      args: CompletionArgs,
    ): AsyncIterable<StreamEvent> {
      if (args.signal?.aborted) {
        yield { kind: "done", reason: "aborted" };
        return;
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

      let response: Response;
      try {
        response = await fetchWithRetry(
          `${baseUrl}/chat/completions`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              model: args.model ?? model,
              // The provider has no cache breakpoints; the system parts are
              // simply concatenated.
              messages: [
                { role: "system", content: systemToText(args.system) },
                ...args.messages.map((m) => ({
                  role: m.role === "assistant" ? "assistant" : "user",
                  content: m.content,
                })),
              ],
              [tokenParam]: maxTokens,
              stream: true,
            }),
          },
          args.signal,
        );
      } catch (err) {
        if (args.signal?.aborted || isAbortError(err)) {
          yield { kind: "done", reason: "aborted" };
          return;
        }
        console.error("[ai/openai] network error", err);
        yield { kind: "error", message: describeNetworkError(err, providerName) };
        yield { kind: "done", reason: "error" };
        return;
      }

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => "");
        console.error(`[ai/openai] HTTP ${response.status}`, text);
        yield {
          kind: "error",
          message: describeHttpError(response.status, text, providerName),
        };
        yield { kind: "done", reason: "error" };
        return;
      }

      let finishReason: string | null = null;
      try {
        for await (const sse of readSseEvents(response.body)) {
          if (sse.data === "[DONE]") {
            yield { kind: "done", reason: mapOpenAiFinishReason(finishReason ?? "stop") };
            return;
          }
          let json: unknown;
          try {
            json = JSON.parse(sse.data);
          } catch {
            continue;
          }
          const parsed = ChunkSchema.safeParse(json);
          if (!parsed.success) continue;
          if (parsed.data.error) {
            console.error("[ai/openai] stream error", parsed.data.error);
            yield {
              kind: "error",
              message:
                parsed.data.error.message ??
                t("settings.errors.streamFailed", { provider: providerName }),
            };
            yield { kind: "done", reason: "error" };
            return;
          }
          const choice = parsed.data.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            yield { kind: "text", delta };
          }
          // Keep reading after finish_reason: a usage chunk and [DONE] follow.
          if (choice.finish_reason) finishReason = choice.finish_reason;
        }
      } catch (err) {
        if (args.signal?.aborted || isAbortError(err)) {
          yield { kind: "done", reason: "aborted" };
          return;
        }
        console.error("[ai/openai] stream read failed", err);
        yield { kind: "error", message: describeNetworkError(err, providerName) };
        yield { kind: "done", reason: "error" };
        return;
      }

      if (args.signal?.aborted) {
        yield { kind: "done", reason: "aborted" };
        return;
      }
      // Some compatible servers close the stream without [DONE]; a finish_reason
      // is enough to call it complete. Without one the reply may be cut short.
      if (finishReason !== null) {
        yield { kind: "done", reason: mapOpenAiFinishReason(finishReason) };
        return;
      }
      yield {
        kind: "error",
        message: t("settings.errors.streamEnded", { provider: providerName }),
      };
      yield { kind: "done", reason: "error" };
    },
  };
}
