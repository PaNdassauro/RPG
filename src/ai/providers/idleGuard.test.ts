import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocaleStore } from "@/i18n";
import type { StreamEvent } from "../provider";
import { createAnthropicProvider } from "./anthropic";
import { createOpenAIProvider } from "./openai";
import { STREAM_IDLE_MS, classifyStreamFailure, createIdleGuard } from "./http";

const encoder = new TextEncoder();

/** A fake `document` that only knows visibilitychange. */
function stubDocument(): { setVisibility: (v: "visible" | "hidden") => void } {
  const target = new EventTarget();
  const doc = {
    visibilityState: "visible" as "visible" | "hidden",
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  };
  vi.stubGlobal("document", doc);
  return {
    setVisibility(v) {
      doc.visibilityState = v;
      target.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  useLocaleStore.setState({ locale: "en" });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createIdleGuard", () => {
  it("aborts after the idle window with no activity", () => {
    const guard = createIdleGuard(undefined, 1000);
    vi.advanceTimersByTime(999);
    expect(guard.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(guard.signal.aborted).toBe(true);
    expect(guard.timedOut).toBe(true);
  });

  it("touch() restarts the window", () => {
    const guard = createIdleGuard(undefined, 1000);
    vi.advanceTimersByTime(800);
    guard.touch();
    vi.advanceTimersByTime(800);
    expect(guard.signal.aborted).toBe(false);
    vi.advanceTimersByTime(200);
    expect(guard.signal.aborted).toBe(true);
  });

  it("follows the caller's signal without reporting a timeout", () => {
    const user = new AbortController();
    const guard = createIdleGuard(user.signal, 1000);
    user.abort();
    expect(guard.signal.aborted).toBe(true);
    expect(guard.timedOut).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts aborted when the caller already aborted", () => {
    const user = new AbortController();
    user.abort();
    const guard = createIdleGuard(user.signal, 1000);
    expect(guard.signal.aborted).toBe(true);
    expect(guard.timedOut).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("dispose() cancels the timer; a late touch re-arms nothing", () => {
    const guard = createIdleGuard(undefined, 1000);
    guard.dispose();
    guard.touch();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(guard.signal.aborted).toBe(false);
  });

  it("defaults to 45 seconds", () => {
    const guard = createIdleGuard();
    vi.advanceTimersByTime(STREAM_IDLE_MS - 1);
    expect(guard.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(guard.timedOut).toBe(true);
  });

  it("classifies the failure: caller abort beats timeout beats network", () => {
    const user = new AbortController();
    const guard = createIdleGuard(user.signal, 1000);
    expect(classifyStreamFailure(new TypeError("x"), user.signal, guard)).toBe("network");
    expect(classifyStreamFailure(new DOMException("a", "AbortError"), user.signal, guard)).toBe("aborted");
    vi.advanceTimersByTime(1000);
    expect(classifyStreamFailure(new DOMException("a", "AbortError"), user.signal, guard)).toBe("stalled");
    user.abort();
    expect(classifyStreamFailure(new DOMException("a", "AbortError"), user.signal, guard)).toBe("aborted");
  });

  describe("returning to the tab", () => {
    it("recovers right away (after a short grace) when the stream went stale while hidden", () => {
      const doc = stubDocument();
      const guard = createIdleGuard(undefined, 10_000);
      doc.setVisibility("hidden");
      // The browser froze our timers; only the wall clock moved.
      vi.setSystemTime(Date.now() + 60_000);
      doc.setVisibility("visible");
      expect(guard.signal.aborted).toBe(false);
      vi.advanceTimersByTime(1_500);
      expect(guard.signal.aborted).toBe(true);
      expect(guard.timedOut).toBe(true);
    });

    it("spares a stream whose buffered chunks arrive right after the tab returns", () => {
      const doc = stubDocument();
      const guard = createIdleGuard(undefined, 10_000);
      doc.setVisibility("hidden");
      vi.setSystemTime(Date.now() + 60_000);
      doc.setVisibility("visible");
      vi.advanceTimersByTime(500);
      guard.touch(); // the reader drained a buffered chunk
      vi.advanceTimersByTime(5_000);
      expect(guard.signal.aborted).toBe(false);
    });

    it("does nothing when the stream is still fresh", () => {
      const doc = stubDocument();
      const guard = createIdleGuard(undefined, 10_000);
      vi.advanceTimersByTime(3_000);
      doc.setVisibility("hidden");
      doc.setVisibility("visible");
      vi.advanceTimersByTime(5_000);
      expect(guard.signal.aborted).toBe(false);
    });

    it("stops listening after dispose", () => {
      const doc = stubDocument();
      const guard = createIdleGuard(undefined, 10_000);
      guard.dispose();
      vi.setSystemTime(Date.now() + 60_000);
      doc.setVisibility("visible");
      vi.advanceTimersByTime(5_000);
      expect(guard.signal.aborted).toBe(false);
    });
  });
});

/** A response whose body sends `head`, then stays silent until the request is aborted. */
function stallingResponse(head: string[], signal: AbortSignal | undefined): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of head) controller.enqueue(encoder.encode(c));
      signal?.addEventListener("abort", () =>
        controller.error(new DOMException("Aborted", "AbortError")),
      );
    },
  });
  return new Response(body, { status: 200 });
}

async function drain(iter: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

const args = { system: "sys", messages: [{ role: "user" as const, content: "hi" }], tools: [] };

const ANTHROPIC_HEAD = [
  `event: message_start\r\ndata: {"type":"message_start"}\r\n\r\n`,
  `event: content_block_delta\r\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"The merchant "}}\r\n\r\n`,
];
const OPENAI_HEAD = [`data: {"choices":[{"delta":{"content":"The merchant "}}]}\r\n\r\n`];

describe.each([
  ["anthropic", () => createAnthropicProvider({ apiKey: "k" }), ANTHROPIC_HEAD],
  ["openai", () => createOpenAIProvider({ apiKey: "k" }), OPENAI_HEAD],
] as const)("%s provider stall watchdog", (_name, make, head) => {
  it("a stream that goes silent mid-reply ends with a friendly error after 45 s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) =>
        Promise.resolve(stallingResponse([...head], init.signal ?? undefined)),
      ),
    );
    const running = drain(make().streamCompletion(args));
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_MS - 1);
    // Still waiting: not finished yet.
    let finished = false;
    void running.then(() => (finished = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const events = await running;
    expect(events[0]).toEqual({ kind: "text", delta: "The merchant " });
    expect(events).toContainEqual({
      kind: "error",
      message: "The connection to the dungeon master dropped. Try again.",
    });
    expect(events.at(-1)).toEqual({ kind: "done", reason: "error" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("speaks Portuguese to a pt-BR player", async () => {
    useLocaleStore.setState({ locale: "pt-BR" });
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) =>
        Promise.resolve(stallingResponse([...head], init.signal ?? undefined)),
      ),
    );
    const running = drain(make().streamCompletion(args));
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_MS);
    const events = await running;
    expect(events).toContainEqual({
      kind: "error",
      message: "A conexão com o mestre caiu — tente de novo.",
    });
  });

  it("a response that never arrives (headers stall) is cut off too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const running = drain(make().streamCompletion(args));
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_MS);
    const events = await running;
    expect(events.map((e) => e.kind)).toEqual(["error", "done"]);
    expect(events[1]).toEqual({ kind: "done", reason: "error" });
  });

  it("keeps waiting while bytes keep arriving, even if the reply is slow overall", async () => {
    const controllerBox: { c?: ReadableStreamDefaultController<Uint8Array> } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(c) {
                controllerBox.c = c;
              },
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    const running = drain(make().streamCompletion(args));
    // 3 x 30 s of silence-then-ping = 90 s total, never 45 s without a byte.
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(30_000);
      controllerBox.c!.enqueue(encoder.encode(": ping\n\n"));
    }
    await vi.advanceTimersByTimeAsync(0);
    controllerBox.c!.close();
    const events = await running;
    // The reply ended without a stop marker: the ordinary "closed early" error,
    // not the stall one.
    expect(events.find((e) => e.kind === "error")).toMatchObject({
      message: expect.stringContaining("closed before the reply finished"),
    });
  });

  it("the player cancelling is reported as aborted, not as a stall", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) =>
        Promise.resolve(stallingResponse([...head], init.signal ?? undefined)),
      ),
    );
    const user = new AbortController();
    const running = drain(make().streamCompletion({ ...args, signal: user.signal }));
    await vi.advanceTimersByTimeAsync(2_000);
    user.abort();
    const events = await running;
    expect(events.at(-1)).toEqual({ kind: "done", reason: "aborted" });
    expect(events.some((e) => e.kind === "error")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
