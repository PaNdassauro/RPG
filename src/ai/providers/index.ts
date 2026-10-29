/**
 * Provider factory: turns a saved ApiKeyRecord into a ready LLMProvider.
 * The DM loop and the summarizer both go through here so every provider the
 * Settings screen can save is actually wired.
 */
import type { ApiKeyRecord } from "@/db/schema";
import type { LLMProvider } from "../provider";
import { createAnthropicProvider } from "./anthropic";
import { createOpenAIProvider } from "./openai";

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";
export const DEFAULT_OLLAMA_MODEL = "llama3.1";

/** Returns null for providers that have no adapter yet (e.g. Gemini). */
export function createProviderFromRecord(record: ApiKeyRecord): LLMProvider | null {
  switch (record.providerId) {
    case "claude":
      return createAnthropicProvider({ apiKey: record.key, model: record.model });
    case "openai":
      return createOpenAIProvider({
        apiKey: record.key,
        model: record.model,
        ...(record.baseUrl ? { baseUrl: record.baseUrl } : {}),
      });
    case "ollama":
      return createOpenAIProvider({
        id: "ollama",
        displayName: "Ollama",
        model: record.model || DEFAULT_OLLAMA_MODEL,
        baseUrl: record.baseUrl || DEFAULT_OLLAMA_BASE_URL,
        tokenParam: "max_tokens",
        ...(record.key ? { apiKey: record.key } : {}),
      });
    default:
      return null;
  }
}
