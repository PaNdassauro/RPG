/**
 * OpenAI provider via raw fetch + SSE. Avoids the openai SDK weight and
 * matches the Anthropic adapter's contract so DM-loop swap is a no-op.
 *
 * OpenAI's Chat Completions API allows direct browser calls — they send
 * `Access-Control-Allow-Origin: *` for `/v1/chat/completions`. We still warn
 * the user about exposing the key from a browser context.
 */
import type { CompletionArgs, LLMProvider, StreamEvent } from "../provider";

export const DEFAULT_OPENAI_MODEL = "gpt-4o";
export const OPENAI_MODEL_OPTIONS = [
  { id: "gpt-4o", label: "GPT-4o (recommended)" },
  { id: "gpt-4o-mini", label: "GPT-4o mini (fastest, cheapest)" },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { id: "gpt-4.1", label: "GPT-4.1" },
] as const;

interface OpenAIConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  /** Optional override for compatible endpoints (Azure OpenAI proxies, etc.). */
  baseUrl?: string;
}

export function createOpenAIProvider(config: OpenAIConfig): LLMProvider {
  const model = config.model ?? DEFAULT_OPENAI_MODEL;
  const maxTokens = config.maxTokens ?? 1024;
  const baseUrl = (config.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");

  return {
    id: "openai",
    displayName: "OpenAI GPT",
    supportsTools: true,
    supportsPromptCaching: false,
    streamCompletion: async function* (
      args: CompletionArgs,
    ): AsyncIterable<StreamEvent> {
      let response: Response;
      const attempt = async () => {
        return await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          signal: args.signal,
          body: JSON.stringify({
            model: args.model ?? model,
            // Convert our normalized message shape to OpenAI's, putting the
            // system prompt as a `system` role at index 0.
            messages: [
              { role: "system", content: args.system },
              ...args.messages.map((m) => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: m.content,
              })),
            ],
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
          message: `OpenAI API ${response.status}: ${text || response.statusText}`,
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

          let nlIdx: number;
          while ((nlIdx = buffer.indexOf("\n\n")) !== -1) {
            const block = buffer.slice(0, nlIdx);
            buffer = buffer.slice(nlIdx + 2);
            const event = parseOpenAiSseBlock(block);
            if (!event) continue;
            if (event === "[DONE]") {
              yield { kind: "done", reason: "stop" };
              return;
            }
            const choice = event.choices?.[0];
            if (!choice) continue;
            const delta = choice.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              yield { kind: "text", delta };
            }
            if (choice.finish_reason) {
              yield {
                kind: "done",
                reason:
                  choice.finish_reason === "length"
                    ? "length"
                    : choice.finish_reason === "tool_calls"
                      ? "tool_calls"
                      : "stop",
              };
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

interface OpenAISseChunk {
  choices?: Array<{
    delta?: { role?: string; content?: string };
    finish_reason?: string | null;
  }>;
}

function parseOpenAiSseBlock(block: string): OpenAISseChunk | "[DONE]" | null {
  // OpenAI sends one `data: ...` line per chunk; sometimes multiple events
  // coalesce in a single block. We just need the first data line.
  const lines = block.split("\n");
  for (const line of lines) {
    if (line.startsWith("data:")) {
      const data = line.slice(5).trimStart();
      if (data === "[DONE]") return "[DONE]";
      try {
        return JSON.parse(data) as OpenAISseChunk;
      } catch {
        return null;
      }
    }
  }
  return null;
}
