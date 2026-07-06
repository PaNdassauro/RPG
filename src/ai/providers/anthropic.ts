/**
 * Anthropic provider via raw fetch + SSE parser. Avoids the @anthropic-ai/sdk
 * weight (≈80 KB) and its browser-only friction. Streams text deltas.
 *
 * Requires `anthropic-dangerous-direct-browser-access: true` because we are
 * calling the API from the browser. The user is warned about this in the
 * Settings UI.
 */
import type {
  CompletionArgs,
  LLMProvider,
  StreamEvent,
} from "../provider";

export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
export const CLAUDE_MODEL_OPTIONS = [
  { id: "claude-opus-4-7", label: "Opus 4.7 (richest prose, slowest)" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (recommended)" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (fastest, lightest)" },
] as const;

interface AnthropicConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export function createAnthropicProvider(config: AnthropicConfig): LLMProvider {
  const model = config.model ?? DEFAULT_CLAUDE_MODEL;
  const maxTokens = config.maxTokens ?? 1024;

  return {
    id: "claude",
    displayName: "Anthropic Claude",
    supportsTools: true,
    supportsPromptCaching: true,
    streamCompletion: async function* (
      args: CompletionArgs,
    ): AsyncIterable<StreamEvent> {
      let response: Response;
      // Retry once on 429/503 with exponential backoff. Anthropic ratelimits
      // sometimes flake on the streaming endpoint and a quick retry restores
      // the request without surfacing an error to the player.
      const attempt = async () => {
        return await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          signal: args.signal,
          body: JSON.stringify({
            model: args.model ?? model,
            // System as a single ephemeral cache block. The system prompt is
            // large and mostly stable across turns (only the encounter snapshot
            // varies on combat rounds). Anthropic caches the prefix for ~5 min,
            // so a campaign of 5+ turns within a session pays the system tokens
            // once at full price and ~10% on every following turn.
            system: [
              {
                type: "text",
                text: args.system,
                cache_control: { type: "ephemeral" },
              },
            ],
            messages: args.messages.map((m) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
            })),
            max_tokens: maxTokens,
            stream: true,
          }),
        });
      };
      try {
        response = await attempt();
        if ((response.status === 429 || response.status === 503) && !args.signal?.aborted) {
          await new Promise((r) => setTimeout(r, 800));
          response = await attempt();
        }
      } catch (err) {
        yield {
          kind: "error",
          message:
            err instanceof Error
              ? `Network error: ${err.message}`
              : "Network error",
        };
        yield { kind: "done", reason: "error" };
        return;
      }

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => "");
        yield {
          kind: "error",
          message: `Anthropic API ${response.status}: ${text || response.statusText}`,
        };
        yield { kind: "done", reason: "error" };
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE events are separated by blank lines.
          let nlIdx: number;
          while ((nlIdx = buffer.indexOf("\n\n")) !== -1) {
            const block = buffer.slice(0, nlIdx);
            buffer = buffer.slice(nlIdx + 2);
            const event = parseSseBlock(block);
            if (!event) continue;

            if (event.type === "content_block_delta") {
              const delta = event.delta;
              if (delta?.type === "text_delta" && typeof delta.text === "string") {
                yield { kind: "text", delta: delta.text };
              }
            } else if (event.type === "message_stop") {
              yield { kind: "done", reason: "stop" };
              return;
            } else if (event.type === "error") {
              yield {
                kind: "error",
                message: event.error?.message ?? "Unknown stream error",
              };
              yield { kind: "done", reason: "error" };
              return;
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          yield { kind: "done", reason: "stop" };
          return;
        }
        yield {
          kind: "error",
          message: err instanceof Error ? err.message : "Stream read failed",
        };
        yield { kind: "done", reason: "error" };
        return;
      }

      yield { kind: "done", reason: "stop" };
    },
  };
}

interface AnthropicSseEvent {
  type: string;
  delta?: { type?: string; text?: string };
  error?: { message?: string };
}

function parseSseBlock(block: string): AnthropicSseEvent | null {
  // Each block is one or more "key: value" lines. We only need `data:`.
  const lines = block.split("\n");
  let dataLine: string | null = null;
  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLine = line.slice(5).trimStart();
      break;
    }
  }
  if (!dataLine || dataLine === "[DONE]") return null;
  try {
    return JSON.parse(dataLine) as AnthropicSseEvent;
  } catch {
    return null;
  }
}
