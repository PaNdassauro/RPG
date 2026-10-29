import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompletionArgs, LLMProvider, StreamEvent } from "@/ai/provider";
import type { Campaign, Chapter, ChatMessage } from "@/schemas/campaign";

vi.mock("@/db/schema", async () => await import("@/test/fakeDb"));

const script = vi.hoisted(() => ({
  calls: [] as CompletionArgs[],
  reply: null as null | ((args: CompletionArgs, n: number) => StreamEvent[]),
  onCall: null as null | ((n: number) => void),
}));
vi.mock("@/ai/providers", () => ({
  createProviderFromRecord: (): LLMProvider => ({
    id: "ollama",
    displayName: "test",
    supportsTools: false,
    supportsPromptCaching: false,
    streamCompletion: async function* (args: CompletionArgs) {
      script.calls.push(args);
      script.onCall?.(script.calls.length);
      const events = script.reply
        ? script.reply(args, script.calls.length)
        : defaultReply(args, script.calls.length);
      for (const e of events) yield e;
    },
  }),
}));

import { clearTables, tables } from "@/test/fakeDb";
import { useSessionStore } from "@/state/sessionStore";
import { useKeysStore } from "@/state/keysStore";
import { maybeSummarize } from "./summarizer";

const ok = (text: string): StreamEvent[] => [
  { kind: "text", delta: text },
  { kind: "done", reason: "stop" },
];
function defaultReply(args: CompletionArgs, n: number): StreamEvent[] {
  const system = typeof args.system === "string" ? args.system : "";
  return ok(system.includes("Fold the chapters") ? `ARC-${n}` : `CHAPTER-${n}`);
}

const CAMPAIGN_ID = "camp-1";
const state = () => useSessionStore.getState();

function campaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: CAMPAIGN_ID,
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
    ...over,
  };
}

/** n narrative messages of `chars` characters each, alternating player / dm. */
function history(n: number, chars = 2_000): ChatMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    campaignId: CAMPAIGN_ID,
    role: i % 2 === 0 ? ("player" as const) : ("dm" as const),
    content: `${String(i).padStart(4, "0")}`.padEnd(chars, "."),
    toolCallIds: [],
    diceRollIds: [],
    ts: i,
  }));
}

function load(camp: Campaign, messages: ChatMessage[]): void {
  tables.campaigns.push(camp as never);
  useSessionStore.setState({ campaignId: camp.id, campaign: camp, messages });
}

function useProvider(id: "ollama" | "claude", model?: string): void {
  useKeysStore.setState({
    activeProvider: id,
    records: { [id]: { providerId: id, key: "k", ...(model ? { model } : {}), updatedAt: 0 } },
  });
}

const stored = (): Campaign => tables.campaigns[0] as unknown as Campaign;
const ch = (i: number): Chapter => ({
  id: `old${i}`,
  fromTurn: i * 12,
  toTurn: i * 12 + 12,
  text: `OLD-CHAPTER-${i}`,
  createdAt: i,
});

beforeEach(() => {
  clearTables();
  state().reset();
  script.calls = [];
  script.reply = null;
  script.onCall = null;
  useProvider("ollama");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  state().reset();
  useKeysStore.setState({ activeProvider: null, records: {} });
  vi.restoreAllMocks();
});

describe("maybeSummarize chapters", () => {
  it("does nothing while everything still fits the window", async () => {
    load(campaign(), history(8));
    await maybeSummarize();
    expect(script.calls).toHaveLength(0);
    expect(stored().chapters).toEqual([]);
  });

  it("writes chapters of at most 12 messages, at most 6 per run, from the raw text", async () => {
    load(campaign(), history(100));
    await maybeSummarize();
    expect(script.calls).toHaveLength(6);
    const chapters = state().campaign!.chapters;
    expect(chapters).toHaveLength(6);
    for (const c of chapters) expect(c.toTurn - c.fromTurn).toBeLessThanOrEqual(12);
    expect(chapters.map((c) => [c.fromTurn, c.toTurn])).toEqual([
      [0, 12], [12, 24], [24, 36], [36, 48], [48, 60], [60, 72],
    ]);
    expect(state().campaign!.summaryThroughTurn).toBe(72);
    // The first call sees the raw messages of its span, not a summary.
    expect(script.calls[0]!.messages[0]!.content).toContain("Player: 0000");
    expect(script.calls[0]!.messages[0]!.content).toContain("DM: 0011");
    expect(script.calls[0]!.messages[0]!.content).not.toContain("0012");
    // Each later call gets the previous chapter as read-only context.
    expect(script.calls[1]!.messages[0]!.content).toContain("CHAPTER-1");
    // Persisted too.
    expect(stored().chapters).toHaveLength(6);
    expect(stored().summaryThroughTurn).toBe(72);

    // The rest follows on the next run, picking up where the last one stopped.
    script.calls = [];
    await maybeSummarize();
    const after = state().campaign!;
    expect(after.chapters[6]!.fromTurn).toBe(72);
    expect(script.calls.length).toBeGreaterThan(0);
    expect(after.chapters.every((c, i) => i === 0 || c.fromTurn === after.chapters[i - 1]!.toTurn)).toBe(true);
  });

  it("lets a forced run go all the way to the end of the story", async () => {
    load(campaign(), history(100));
    await maybeSummarize({ force: true });
    expect(state().campaign!.summaryThroughTurn).toBe(100);
    expect(state().campaign!.chapters.length).toBe(9);
    expect(script.calls.length).toBeGreaterThan(6);
  });

  it("continues from a legacy summary without touching it", async () => {
    load(campaign({ rollingSummary: "Legacy.", summaryThroughTurn: 24 }), history(60));
    await maybeSummarize();
    const c = state().campaign!;
    expect(c.chapters[0]!.fromTurn).toBe(24);
    expect(c.rollingSummary).toBe("Legacy.");
  });

  it("uses Sonnet for Claude and the record's own model for everyone else", async () => {
    load(campaign(), history(100));
    await maybeSummarize();
    expect(script.calls[0]!.model).toBeUndefined();

    clearTables();
    state().reset();
    script.calls = [];
    useProvider("claude");
    load(campaign(), history(10, 150_000));
    await maybeSummarize();
    expect(script.calls.length).toBeGreaterThan(0);
    for (const call of script.calls) expect(call.model).toBe("claude-sonnet-5-5");

    clearTables();
    state().reset();
    script.calls = [];
    useProvider("ollama", "llama-x");
    load(campaign(), history(100));
    await maybeSummarize();
    expect(script.calls[0]!.model).toBe("llama-x");
  });
});

describe("maybeSummarize arcs", () => {
  it("folds the 8 oldest chapters into an arc, from the chapters themselves", async () => {
    const chapters = Array.from({ length: 12 }, (_, i) => ch(i));
    load(campaign({ chapters, summaryThroughTurn: 144 }), history(170));
    await maybeSummarize();
    const c = state().campaign!;
    // Two new chapters pushed the unfolded count to 14: one fold of 8.
    expect(c.chapters).toHaveLength(14);
    expect(c.arcs).toHaveLength(1);
    expect(c.arcs[0]!.fromTurn).toBe(0);
    expect(c.arcs[0]!.toTurn).toBe(96);
    expect(c.chapters.filter((x) => x.arcId === c.arcs[0]!.id).map((x) => x.id)).toEqual(
      chapters.slice(0, 8).map((x) => x.id),
    );
    expect(c.chapters.filter((x) => x.arcId === undefined)).toHaveLength(6);
    const arcCall = script.calls[script.calls.length - 1]!;
    const prompt = arcCall.messages[0]!.content;
    for (let i = 0; i < 8; i++) expect(prompt).toContain(`OLD-CHAPTER-${i}`);
    expect(prompt).not.toContain("OLD-CHAPTER-8");
    expect(prompt).not.toContain("[turns 145-"); // not the freshly written chapters
    expect(stored().arcs).toHaveLength(1);
  });

  it("does not fold at exactly 12 unfolded chapters", async () => {
    load(campaign({ chapters: Array.from({ length: 12 }, (_, i) => ch(i)), summaryThroughTurn: 144 }), history(20));
    await maybeSummarize();
    expect(state().campaign!.arcs).toEqual([]);
    expect(script.calls).toHaveLength(0);
  });
});

describe("maybeSummarize safety", () => {
  it("rejects an empty chapter and keeps the previous memory", async () => {
    load(campaign(), history(100));
    script.reply = () => ok("   ");
    await maybeSummarize();
    expect(state().campaign!.chapters).toEqual([]);
    expect(state().campaign!.summaryThroughTurn).toBe(0);
    expect(console.warn).toHaveBeenCalled();
  });

  it("logs a stream that does not end with stop and writes nothing", async () => {
    load(campaign(), history(100));
    script.reply = () => [{ kind: "text", delta: "partial" }, { kind: "done", reason: "length" }];
    await maybeSummarize();
    expect(state().campaign!.chapters).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it("keeps the chapters already written when a later call fails", async () => {
    load(campaign(), history(100));
    script.reply = (args, n) => (n <= 2 ? defaultReply(args, n) : [{ kind: "error", message: "boom" }]);
    await maybeSummarize();
    expect(state().campaign!.chapters).toHaveLength(2);
    expect(state().campaign!.summaryThroughTurn).toBe(24);
    expect(console.error).toHaveBeenCalled();
  });

  it("holds an in-flight lock per campaign", async () => {
    load(campaign(), history(100));
    await Promise.all([maybeSummarize(), maybeSummarize()]);
    expect(script.calls).toHaveLength(6);
    expect(state().campaign!.chapters).toHaveLength(6);
  });

  it("writes by id when the player switched campaigns mid-run", async () => {
    load(campaign(), history(100));
    script.onCall = (n) => {
      if (n === 1) {
        useSessionStore.setState({
          campaignId: "other",
          campaign: campaign({ id: "other" }),
          messages: [],
        });
      }
    };
    await maybeSummarize();
    expect(state().campaign!.id).toBe("other");
    expect(state().campaign!.chapters).toEqual([]);
    expect(stored().id).toBe(CAMPAIGN_ID);
    expect(stored().chapters).toHaveLength(6);
    expect(stored().summaryThroughTurn).toBe(72);
  });

  it("no-ops without a configured provider", async () => {
    load(campaign(), history(100));
    useKeysStore.setState({ activeProvider: null, records: {} });
    await maybeSummarize();
    expect(script.calls).toHaveLength(0);
  });
});
