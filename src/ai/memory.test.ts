import { describe, expect, it } from "vitest";
import {
  ARC_FOLD_COUNT,
  ARC_TRIGGER,
  LEGACY_ARC_ID,
  MAX_CHAPTER_MESSAGES,
  applyMemoryUpdate,
  arcFoldCandidates,
  chunkSpans,
  formatMemoryBlock,
  memoryArcs,
  spanTranscript,
  unfoldedChapters,
} from "./memory";
import { CLOUD_PROFILE, LOCAL_PROFILE } from "./context";
import type { Arc, Campaign, Chapter, ChatMessage } from "@/schemas/campaign";
import { CampaignSchema } from "@/schemas/campaign";

function chapter(i: number, over: Partial<Chapter> = {}): Chapter {
  return {
    id: `ch${i}`,
    fromTurn: i * 10,
    toTurn: i * 10 + 10,
    text: `Chapter text ${i}.`,
    createdAt: i,
    ...over,
  };
}

function campaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "c",
    title: "T",
    characterId: "ch",
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

describe("chunkSpans", () => {
  it("splits into spans of at most 12 narrative messages", () => {
    const spans = chunkSpans(0, 30);
    expect(spans).toEqual([
      { from: 0, to: 12 },
      { from: 12, to: 24 },
      { from: 24, to: 30 },
    ]);
    for (const s of chunkSpans(7, 200)) expect(s.to - s.from).toBeLessThanOrEqual(MAX_CHAPTER_MESSAGES);
  });

  it("returns nothing for an empty or inverted range", () => {
    expect(chunkSpans(5, 5)).toEqual([]);
    expect(chunkSpans(9, 5)).toEqual([]);
  });
});

describe("arc folding", () => {
  const chapters = (n: number) => Array.from({ length: n }, (_, i) => chapter(i));

  it("folds nothing up to 12 unfolded chapters", () => {
    expect(arcFoldCandidates(chapters(ARC_TRIGGER))).toEqual([]);
  });

  it("folds the 8 oldest unfolded chapters once there are more than 12", () => {
    const fold = arcFoldCandidates(chapters(ARC_TRIGGER + 1));
    expect(fold.map((c) => c.id)).toEqual(chapters(ARC_FOLD_COUNT).map((c) => c.id));
  });

  it("skips chapters that already belong to an arc", () => {
    const list = chapters(15).map((c, i) => (i < 4 ? { ...c, arcId: "a0" } : c));
    // 11 unfolded: below the trigger.
    expect(arcFoldCandidates(list)).toEqual([]);
    const more = [...list, chapter(15), chapter(16)];
    expect(arcFoldCandidates(more).map((c) => c.id)).toEqual(
      more.slice(4, 4 + ARC_FOLD_COUNT).map((c) => c.id),
    );
  });
});

describe("applyMemoryUpdate", () => {
  it("appends chapters and moves summaryThroughTurn to the newest one", () => {
    const next = applyMemoryUpdate(campaign(), { chapters: [chapter(0), chapter(1)] });
    expect(next.chapters.map((c) => c.id)).toEqual(["ch0", "ch1"]);
    expect(next.summaryThroughTurn).toBe(20);
  });

  it("never moves summaryThroughTurn back", () => {
    const next = applyMemoryUpdate(campaign({ summaryThroughTurn: 500 }), { chapters: [chapter(0)] });
    expect(next.summaryThroughTurn).toBe(500);
  });

  it("adds an arc and stamps the folded chapters, leaving the rest alone", () => {
    const base = campaign({ chapters: [chapter(0), chapter(1), chapter(2)], summaryThroughTurn: 30 });
    const arc: Arc = { id: "a1", fromTurn: 0, toTurn: 20, text: "Arc.", createdAt: 5 };
    const next = applyMemoryUpdate(base, { arc: { arc, chapterIds: ["ch0", "ch1"] } });
    expect(next.arcs).toEqual([arc]);
    expect(next.chapters.map((c) => c.arcId)).toEqual(["a1", "a1", undefined]);
    expect(next.summaryThroughTurn).toBe(30);
    expect(unfoldedChapters(next).map((c) => c.id)).toEqual(["ch2"]);
  });
});

describe("legacy rollingSummary", () => {
  it("is the first arc, covering turns 0 to the old summaryThroughTurn", () => {
    const arcs = memoryArcs(campaign({ rollingSummary: "Old story.", summaryThroughTurn: 44 }));
    expect(arcs).toEqual([
      { id: LEGACY_ARC_ID, fromTurn: 0, toTurn: 44, text: "Old story.", createdAt: 0 },
    ]);
  });

  it("keeps its range once chapters start, and stays ahead of real arcs", () => {
    const real: Arc = { id: "a1", fromTurn: 44, toTurn: 100, text: "New arc.", createdAt: 1 };
    const arcs = memoryArcs(
      campaign({
        rollingSummary: "Old story.",
        summaryThroughTurn: 200,
        chapters: [chapter(0, { fromTurn: 44, toTurn: 56 })],
        arcs: [real],
      }),
    );
    expect(arcs.map((a) => a.id)).toEqual([LEGACY_ARC_ID, "a1"]);
    expect(arcs[0]).toMatchObject({ fromTurn: 0, toTurn: 44 });
  });

  it("is absent when the summary is empty", () => {
    expect(memoryArcs(campaign({ rollingSummary: "  " }))).toEqual([]);
  });

  it("is never rewritten by memory updates", () => {
    const base = campaign({ rollingSummary: "Old story.", summaryThroughTurn: 44 });
    const next = applyMemoryUpdate(base, { chapters: [chapter(5, { fromTurn: 44, toTurn: 56 })] });
    expect(next.rollingSummary).toBe("Old story.");
  });

  it("old saves without the new fields still parse", () => {
    const parsed = CampaignSchema.parse({
      id: "c",
      title: "T",
      characterId: "x",
      worldSeed: "s",
      settingId: "forgotten-realms",
      currentLocation: { name: "Here" },
      rollingSummary: "Legacy.",
      summaryThroughTurn: 12,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(parsed.chapters).toEqual([]);
    expect(parsed.arcs).toEqual([]);
    expect(memoryArcs(parsed)[0]).toMatchObject({ text: "Legacy.", toTurn: 12 });
  });
});

describe("formatMemoryBlock", () => {
  it("is empty when there is nothing to remember", () => {
    expect(formatMemoryBlock(campaign(), CLOUD_PROFILE)).toBe("");
  });

  it("lists arcs, then unfolded chapters, oldest first, each with its turn range", () => {
    const c = campaign({
      arcs: [{ id: "a1", fromTurn: 0, toTurn: 80, text: "First arc.", createdAt: 1 }],
      chapters: [chapter(8, { arcId: "a1" }), chapter(9), chapter(10)],
    });
    const block = formatMemoryBlock(c, CLOUD_PROFILE);
    expect(block.startsWith("<memory>\n")).toBe(true);
    expect(block.endsWith("\n</memory>")).toBe(true);
    expect(block).toContain("[turns 1-80] First arc.");
    expect(block).toContain("[turns 91-100] Chapter text 9.");
    expect(block).not.toContain("Chapter text 8.");
    expect(block.indexOf("First arc.")).toBeLessThan(block.indexOf("Chapter text 9."));
    expect(block.indexOf("Chapter text 9.")).toBeLessThan(block.indexOf("Chapter text 10."));
  });

  it("honors chaptersShown and arcsShown on the local profile", () => {
    const arcs: Arc[] = Array.from({ length: 5 }, (_, i) => ({
      id: `a${i}`,
      fromTurn: i,
      toTurn: i + 1,
      text: `Arc ${i}!`,
      createdAt: i,
    }));
    const chapters = Array.from({ length: 7 }, (_, i) => chapter(i));
    const block = formatMemoryBlock(campaign({ arcs, chapters }), LOCAL_PROFILE);
    expect(block).not.toContain("Arc 1!");
    for (const a of [2, 3, 4]) expect(block).toContain(`Arc ${a}!`);
    expect(block).not.toContain("Chapter text 2.");
    for (const c of [3, 4, 5, 6]) expect(block).toContain(`Chapter text ${c}.`);
  });
});

describe("spanTranscript", () => {
  const m = (role: ChatMessage["role"], content: string): ChatMessage => ({
    id: content,
    campaignId: "c",
    role,
    content,
    toolCallIds: [],
    diceRollIds: [],
    ts: 0,
  });

  it("includes only the span's narrative messages and their engine results", () => {
    const history = [
      m("player", "p0"),
      m("system", "roll-after-0"),
      m("dm", "d1"),
      m("tool", "ignored"),
      m("player", "p2"),
      m("system", "roll-after-2"),
      m("dm", "d3"),
    ];
    const out = spanTranscript(history, 1, 3);
    expect(out).toBe("DM: d1\n\nPlayer: p2\n\n(Engine: roll-after-2)");
  });
});
