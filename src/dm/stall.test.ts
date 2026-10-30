/**
 * The frozen-typing bug end to end: the real Anthropic provider behind a fetch
 * whose SSE stream goes silent mid-reply. The turn must release `busy` (so the
 * player can send again) both via the watchdog and via the Cancel escape hatch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign } from "@/schemas/campaign";
import { makeCharacter } from "@/test/fixtures";
import { useLocaleStore } from "@/i18n";

vi.mock("@/db/schema", async () => await import("@/test/fakeDb"));

import { clearTables, tables } from "@/test/fakeDb";
import { useSessionStore } from "@/state/sessionStore";
import { useKeysStore } from "@/state/keysStore";
import { STREAM_IDLE_MS } from "@/ai/providers/http";
import { runDmTurn } from "./loop";

const state = () => useSessionStore.getState();
const encoder = new TextEncoder();

function load(): void {
  const camp = {
    id: "camp-1",
    title: "T",
    characterId: "char-1",
    worldSeed: "s",
    settingId: "forgotten-realms",
    currentLocation: { name: "Here", description: "" },
    inWorldDay: 1,
    quests: [],
    factions: [],
    companions: [],
    pinnedFacts: [],
    placesVisited: [],
    npcsMet: [],
    rollingSummary: "",
    chapters: [],
    arcs: [],
    summaryThroughTurn: 0,
    journal: "",
    createdAt: 0,
    updatedAt: 0,
  } as Campaign;
  const character = makeCharacter();
  tables.campaigns.push(camp as never);
  tables.characters.push(character as never);
  useSessionStore.setState({ campaignId: camp.id, campaign: camp, character });
}

/** Sends a first chunk of prose, then nothing until the request is aborted. */
function stubStallingFetch(): { aborted: () => boolean } {
  let aborted = false;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `event: content_block_delta\r\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"The merchant strokes his beard, "}}\r\n\r\n`,
            ),
          );
          init.signal?.addEventListener("abort", () => {
            aborted = true;
            controller.error(new DOMException("Aborted", "AbortError"));
          });
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    }),
  );
  return { aborted: () => aborted };
}

beforeEach(() => {
  vi.useFakeTimers();
  clearTables();
  useSessionStore.getState().reset();
  useLocaleStore.setState({ locale: "pt-BR" });
  useKeysStore.setState({
    activeProvider: "claude",
    records: { claude: { providerId: "claude", key: "k", updatedAt: 0 } },
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  useSessionStore.getState().reset();
  useKeysStore.setState({ activeProvider: null, records: {} });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a stream that goes silent", () => {
  it("releases busy after the watchdog window and tells the player in their language", async () => {
    load();
    const net = stubStallingFetch();
    const running = runDmTurn({ playerInput: "para onde vamos?", isFirstTurn: false });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(state().busy).toBe(true);
    expect(state().draftDm).toContain("The merchant");
    expect(state().busySince).not.toBeNull();

    await vi.advanceTimersByTimeAsync(STREAM_IDLE_MS);
    await running;

    expect(net.aborted()).toBe(true);
    expect(state().busy).toBe(false);
    expect(state().busySince).toBeNull();
    expect(state().streaming).toBe(false);
    expect(state().draftDm).toBe("");
    expect(state().turnError).toBe("A conexão com o mestre caiu — tente de novo.");
    expect(state().error).toBeNull();
    expect(tables.messages.filter((m) => m.role === "dm")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("Cancel (abortTurn) frees the player at once, with no error and no half-sentence saved", async () => {
    load();
    const net = stubStallingFetch();
    const running = runDmTurn({ playerInput: "para onde vamos?", isFirstTurn: false });
    await vi.advanceTimersByTimeAsync(21_000);
    expect(state().busy).toBe(true);

    state().abortTurn();
    expect(state().busy).toBe(false);
    await running;

    expect(net.aborted()).toBe(true);
    expect(state().turnError).toBeNull();
    expect(state().draftDm).toBe("");
    expect(tables.messages.filter((m) => m.role === "dm")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the next turn clears the old error and works normally", async () => {
    load();
    stubStallingFetch();
    const first = runDmTurn({ playerInput: "um", isFirstTurn: false });
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_MS + 1_000);
    await first;
    expect(state().turnError).not.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(c) {
                c.enqueue(
                  encoder.encode(
                    `event: content_block_delta\r\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Ele sorri."}}\r\n\r\nevent: message_stop\r\ndata: {"type":"message_stop"}\r\n\r\n`,
                  ),
                );
                c.close();
              },
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    await runDmTurn({ playerInput: "dois", isFirstTurn: false });
    expect(state().turnError).toBeNull();
    expect(tables.messages.filter((m) => m.role === "dm").map((m) => m.content)).toEqual(["Ele sorri."]);
    expect(state().busy).toBe(false);
  });
});
