import type { DMAction } from "@/schemas/dmActions";

export type ProviderId = "claude" | "openai" | "gemini" | "ollama";

export interface NormalizedMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Tool call results sent back to the model. */
  toolCallId?: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON schema for the tool's input. */
  parameters: Record<string, unknown>;
}

export type StreamEvent =
  | { kind: "text"; delta: string }
  | { kind: "tool_call"; id: string; name: string; argsJSON: string }
  | { kind: "error"; message: string }
  | { kind: "done"; reason: "stop" | "tool_calls" | "length" | "error" | "refusal" | "aborted" };

export interface CompletionArgs {
  system: string;
  messages: NormalizedMessage[];
  tools: ToolSpec[];
  /** Some providers require an explicit model id; adapters resolve a default if absent. */
  model?: string;
  signal?: AbortSignal;
}

export interface LLMProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  /** True if the provider has native function/tool calling. */
  readonly supportsTools: boolean;
  /** True if the provider supports prompt caching breakpoints. */
  readonly supportsPromptCaching: boolean;

  streamCompletion(args: CompletionArgs): AsyncIterable<StreamEvent>;
}

export interface ToolCallResult {
  id: string;
  action: DMAction;
}

/**
 * Convert a raw provider tool call (id + JSON args) to a validated DMAction.
 * Returns null if validation fails — caller decides whether to retry / warn.
 */
export type ToolCallParser = (raw: { id: string; name: string; argsJSON: string }) => ToolCallResult | null;
