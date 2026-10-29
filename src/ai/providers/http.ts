/**
 * Shared HTTP plumbing for the raw-fetch provider adapters: retry with
 * backoff, abort-aware sleeping, and friendly error messages.
 */
import { z } from "zod";
import { t } from "@/i18n";

/** Statuses worth retrying: rate limit and transient server/overload errors. */
const RETRYABLE_STATUS: ReadonlySet<number> = new Set([429, 500, 502, 503, 529]);
export const MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 8_000;

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

/** Sleep that rejects with an AbortError as soon as the signal fires. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Delay before the next attempt. `failedAttempt` is 1-based. A numeric
 * `retry-after` header (seconds) wins; otherwise exponential backoff with jitter.
 */
export function retryDelayMs(
  failedAttempt: number,
  retryAfter: string | null,
  random: () => number = Math.random,
): number {
  if (retryAfter !== null && retryAfter.trim() !== "") {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
    }
  }
  const exp = BASE_BACKOFF_MS * 2 ** (failedAttempt - 1);
  return Math.min(exp + random() * 500, MAX_BACKOFF_MS);
}

/**
 * POST with retries on retryable statuses. Returns the final response (which
 * may still be non-OK once attempts are exhausted — the caller reports it).
 * Throws on network failure or abort; failed intermediate bodies are cancelled.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
  options: { maxAttempts?: number; sleep?: typeof abortableSleep } = {},
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const sleep = options.sleep ?? abortableSleep;
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { ...init, ...(signal ? { signal } : {}) });
    if (response.ok || !RETRYABLE_STATUS.has(response.status) || attempt >= maxAttempts) {
      return response;
    }
    const delay = retryDelayMs(attempt, response.headers.get("retry-after"));
    await response.body?.cancel().catch(() => undefined);
    console.warn(
      `[ai] HTTP ${response.status}, retrying in ${Math.round(delay)}ms (attempt ${attempt}/${maxAttempts})`,
    );
    await sleep(delay, signal);
  }
}

const ErrorBodySchema = z.object({
  error: z.union([z.object({ message: z.string() }).passthrough(), z.string()]),
});

/** Pull a human message out of a JSON error body, or null if it isn't one. */
export function extractErrorMessage(bodyText: string): string | null {
  try {
    const parsed = ErrorBodySchema.safeParse(JSON.parse(bodyText));
    if (!parsed.success) return null;
    const e = parsed.data.error;
    return typeof e === "string" ? e : e.message;
  } catch {
    return null;
  }
}

/** Translated, player-facing message for a failed HTTP response. */
export function describeHttpError(
  status: number,
  bodyText: string,
  provider: string,
): string {
  if (status === 401 || status === 403) return t("settings.errors.auth", { provider });
  if (status === 429) return t("settings.errors.rateLimit", { provider });
  if (status === 503 || status === 529) return t("settings.errors.overloaded", { provider });
  const detail = extractErrorMessage(bodyText) ?? (bodyText.trim() || `HTTP ${status}`);
  return t("settings.errors.http", { provider, status, message: detail.slice(0, 300) });
}

export function describeNetworkError(err: unknown, provider: string): string {
  return t("settings.errors.network", {
    provider,
    message: err instanceof Error ? err.message : String(err),
  });
}
