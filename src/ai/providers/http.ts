/**
 * Shared HTTP plumbing for the raw-fetch provider adapters: retry with
 * backoff, abort-aware sleeping, and friendly error messages.
 */
import { z } from "zod";
import { t } from "@/i18n";
import type { StreamEvent } from "../provider";

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

/** No bytes for this long on a request or an open stream = the connection is dead. */
export const STREAM_IDLE_MS = 45_000;
/** After the tab returns, wait this long for buffered chunks before calling a stale stream dead. */
const VISIBLE_GRACE_MS = 1_500;

/**
 * Inactivity watchdog for one provider request. `signal` aborts when the
 * caller's signal does, or when nothing has arrived for `idleMs`: a silently
 * stalled connection (background-tab throttling, network change, a sleeping
 * laptop) never errors on its own, so `reader.read()` would hang forever and
 * the turn would stay busy. Call `touch()` on every sign of life.
 */
export interface IdleGuard {
  signal: AbortSignal;
  touch: () => void;
  /** True once the watchdog (not the caller) aborted the request. */
  readonly timedOut: boolean;
  dispose: () => void;
}

export function createIdleGuard(parent?: AbortSignal, idleMs: number = STREAM_IDLE_MS): IdleGuard {
  const controller = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  let lastActivity = Date.now();
  let timedOut = false;
  let disposed = false;

  const fire = () => {
    // Handles are cleared before acting: a fired timer's handle is dead, and
    // dispose() below must not try to clear it.
    idleTimer = undefined;
    graceTimer = undefined;
    if (disposed || controller.signal.aborted) return;
    timedOut = true;
    dispose();
    controller.abort();
  };
  const arm = () => {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    idleTimer = setTimeout(fire, idleMs);
  };
  const stale = () => Date.now() - lastActivity >= idleMs;

  // Timers are throttled in a hidden tab and don't tick while a laptop sleeps,
  // so on return judge by the clock instead of waiting for the timer.
  const onVisibility = () => {
    if (disposed || document.visibilityState !== "visible" || !stale()) return;
    if (graceTimer !== undefined) clearTimeout(graceTimer);
    graceTimer = setTimeout(() => {
      graceTimer = undefined;
      if (stale()) fire();
    }, VISIBLE_GRACE_MS);
  };
  const onParentAbort = () => {
    dispose();
    controller.abort();
  };

  function dispose() {
    disposed = true;
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    if (graceTimer !== undefined) clearTimeout(graceTimer);
    idleTimer = undefined;
    graceTimer = undefined;
    parent?.removeEventListener("abort", onParentAbort);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
  }

  if (parent?.aborted) {
    disposed = true;
    controller.abort();
  } else {
    parent?.addEventListener("abort", onParentAbort, { once: true });
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    arm();
  }

  return {
    signal: controller.signal,
    touch() {
      if (disposed) return;
      lastActivity = Date.now();
      arm();
    },
    get timedOut() {
      return timedOut;
    },
    dispose,
  };
}

/** Why a stream or request threw: the player cancelled, the watchdog fired, or the network failed. */
export function classifyStreamFailure(
  err: unknown,
  userSignal: AbortSignal | undefined,
  guard: IdleGuard,
): "aborted" | "stalled" | "network" {
  if (userSignal?.aborted) return "aborted";
  if (guard.timedOut) return "stalled";
  return isAbortError(err) ? "aborted" : "network";
}

/** Player-facing error for a stalled connection. */
export function describeStall(): string {
  return t("play.turn.connectionLost");
}

/**
 * Run a provider stream under an inactivity watchdog, always releasing it.
 * `run` receives the guard: pass `guard.signal` to fetch, `guard.touch` to the
 * SSE reader, and report `guard.timedOut` as a stall.
 */
export async function* withIdleGuard(
  userSignal: AbortSignal | undefined,
  run: (guard: IdleGuard) => AsyncIterable<StreamEvent>,
): AsyncGenerator<StreamEvent> {
  const guard = createIdleGuard(userSignal);
  try {
    yield* run(guard);
  } finally {
    guard.dispose();
  }
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
  options: {
    maxAttempts?: number;
    sleep?: typeof abortableSleep;
    /** Called on each response and after each backoff: the watchdog's sign of life. */
    onActivity?: () => void;
  } = {},
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const sleep = options.sleep ?? abortableSleep;
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { ...init, ...(signal ? { signal } : {}) });
    options.onActivity?.();
    if (response.ok || !RETRYABLE_STATUS.has(response.status) || attempt >= maxAttempts) {
      return response;
    }
    const delay = retryDelayMs(attempt, response.headers.get("retry-after"));
    await response.body?.cancel().catch(() => undefined);
    console.warn(
      `[ai] HTTP ${response.status}, retrying in ${Math.round(delay)}ms (attempt ${attempt}/${maxAttempts})`,
    );
    await sleep(delay, signal);
    options.onActivity?.();
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
