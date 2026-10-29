/**
 * Minimal Server-Sent Events parser. Pure and incremental so it can be unit
 * tested without a network: feed it decoded text chunks as they arrive and it
 * returns the events completed so far.
 *
 * Handles what real-world proxies do to a stream: CRLF line endings, events
 * split across chunks at any byte, multiple `data:` lines in one event, comment
 * lines, and a final event that is not followed by a blank line (`flush`).
 */
export interface SseEvent {
  /** Value of the `event:` field, if present. */
  event: string | null;
  /** All `data:` lines joined with "\n" (per the SSE spec). */
  data: string;
}

const EVENT_BOUNDARY = /\r?\n\r?\n/;

function parseBlock(block: string): SseEvent | null {
  let event: string | null = null;
  const data: string[] = [];
  for (const rawLine of block.split(/\r?\n/)) {
    if (rawLine === "" || rawLine.startsWith(":")) continue;
    const colon = rawLine.indexOf(":");
    const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
    let value = colon === -1 ? "" : rawLine.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  if (data.length === 0) return null;
  return { event, data: data.join("\n") };
}

export interface SseParser {
  /** Feed a decoded chunk; returns every event completed by it. */
  push(chunk: string): SseEvent[];
  /** Call at end of stream; parses whatever is left in the buffer. */
  flush(): SseEvent[];
}

export function createSseParser(): SseParser {
  let buffer = "";
  return {
    push(chunk) {
      buffer += chunk;
      const events: SseEvent[] = [];
      for (;;) {
        const match = EVENT_BOUNDARY.exec(buffer);
        if (!match) break;
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const parsed = parseBlock(block);
        if (parsed) events.push(parsed);
      }
      return events;
    },
    flush() {
      const rest = buffer;
      buffer = "";
      if (rest.trim() === "") return [];
      const parsed = parseBlock(rest);
      return parsed ? [parsed] : [];
    },
  };
}

/**
 * Read a streaming fetch body as SSE events. Decodes UTF-8 incrementally,
 * flushes the parser at EOF, and always releases the reader.
 */
export async function* readSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield* parser.push(decoder.decode(value, { stream: true }));
    }
    yield* parser.push(decoder.decode());
    yield* parser.flush();
  } finally {
    // Release the connection if the consumer stopped early (e.g. on a terminal event).
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
