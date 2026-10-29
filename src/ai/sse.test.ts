import { describe, expect, it } from "vitest";
import { createSseParser, readSseEvents, type SseEvent } from "./sse";

function collect(chunks: string[]): SseEvent[] {
  const parser = createSseParser();
  const out: SseEvent[] = [];
  for (const c of chunks) out.push(...parser.push(c));
  out.push(...parser.flush());
  return out;
}

describe("createSseParser", () => {
  it("parses LF-separated events", () => {
    expect(collect(['event: a\ndata: {"x":1}\n\ndata: two\n\n'])).toEqual([
      { event: "a", data: '{"x":1}' },
      { event: null, data: "two" },
    ]);
  });

  it("parses CRLF-separated events (proxies)", () => {
    expect(collect(["event: m\r\ndata: one\r\n\r\ndata: two\r\n\r\n"])).toEqual([
      { event: "m", data: "one" },
      { event: null, data: "two" },
    ]);
  });

  it("handles a chunk boundary in the middle of an event and of a delimiter", () => {
    expect(collect(["data: hel", "lo\n", "\ndata: wor", "ld\r", "\n\r\n"])).toEqual([
      { event: null, data: "hello" },
      { event: null, data: "world" },
    ]);
  });

  it("flushes a final event that has no trailing blank line", () => {
    expect(collect(["data: first\n\ndata: last"])).toEqual([
      { event: null, data: "first" },
      { event: null, data: "last" },
    ]);
  });

  it("joins multiple data lines and skips comments", () => {
    expect(collect([": keep-alive\ndata: a\ndata: b\n\n"])).toEqual([
      { event: null, data: "a\nb" },
    ]);
  });

  it("ignores blocks without data", () => {
    expect(collect(["event: ping\n\n", ": hi\n\n"])).toEqual([]);
  });
});

describe("readSseEvents", () => {
  it("decodes a multi-byte character split across chunks and flushes at EOF", async () => {
    const bytes = new TextEncoder().encode("data: Costa ✦ da Espada\n\ndata: fim");
    const cut = new TextEncoder().encode("data: Costa ").length + 1; // inside the 3-byte ✦
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });
    const events: SseEvent[] = [];
    for await (const e of readSseEvents(body)) events.push(e);
    expect(events).toEqual([
      { event: null, data: "Costa ✦ da Espada" },
      { event: null, data: "fim" },
    ]);
  });
});
