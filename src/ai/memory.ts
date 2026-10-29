/**
 * Long-term campaign memory: a two-level tree of chapters and arcs, plus the
 * pure helpers the prompt, the summarizer and the recap share.
 *
 * Chapters are append-only chronicles written from the raw text of the turns
 * that left the verbatim window. When too many pile up, the oldest are folded
 * into an arc (depth 2 at most). Turn numbers are narrative-message indices
 * (DM + player), end-exclusive, the unit `Campaign.summaryThroughTurn` uses.
 */
import type { Arc, Campaign, Chapter, ChatMessage } from "@/schemas/campaign";
import type { ContextProfile } from "./context";

/** A chapter covers at most this many narrative messages. */
export const MAX_CHAPTER_MESSAGES = 12;
/** One summarizer run writes at most this many chapters; the rest wait a turn. */
export const MAX_CHAPTERS_PER_RUN = 6;
/** More unfolded chapters than this triggers a fold into an arc. */
export const ARC_TRIGGER = 12;
/** How many of the oldest unfolded chapters one arc absorbs. */
export const ARC_FOLD_COUNT = 8;

/** Id of the synthetic arc made from a pre-chapters `rollingSummary`. */
export const LEGACY_ARC_ID = "legacy-summary";

/**
 * Arcs in reading order. A legacy `rollingSummary` (written before chapters
 * existed) is always the first arc, covering turns 0 up to where chapters
 * begin. It is derived, never rewritten.
 */
export function memoryArcs(campaign: Campaign): Arc[] {
  const legacy = campaign.rollingSummary.trim();
  const arcs = campaign.arcs ?? [];
  if (legacy.length === 0) return arcs;
  const chapters = campaign.chapters ?? [];
  const toTurn = chapters.length > 0 ? chapters[0]!.fromTurn : campaign.summaryThroughTurn;
  return [
    { id: LEGACY_ARC_ID, fromTurn: 0, toTurn, text: legacy, createdAt: 0 },
    ...arcs,
  ];
}

/** Chapters not yet folded into an arc, oldest first. */
export function unfoldedChapters(campaign: Campaign): Chapter[] {
  return (campaign.chapters ?? []).filter((c) => c.arcId === undefined);
}

/** Split [from, to) into spans of at most `max` narrative messages. */
export function chunkSpans(
  from: number,
  to: number,
  max: number = MAX_CHAPTER_MESSAGES,
): Array<{ from: number; to: number }> {
  const spans: Array<{ from: number; to: number }> = [];
  for (let at = from; at < to; at += max) spans.push({ from: at, to: Math.min(at + max, to) });
  return spans;
}

/** The chapters to fold into the next arc: the oldest unfolded ones, once there are too many. */
export function arcFoldCandidates(chapters: Chapter[]): Chapter[] {
  const unfolded = chapters.filter((c) => c.arcId === undefined);
  return unfolded.length > ARC_TRIGGER ? unfolded.slice(0, ARC_FOLD_COUNT) : [];
}

export interface MemoryUpdate {
  /** New chapters, appended in order. */
  chapters?: Chapter[];
  /** A new arc and the chapters it folds. */
  arc?: { arc: Arc; chapterIds: string[] };
}

/** Apply an update to a campaign record; `summaryThroughTurn` follows the newest chapter. */
export function applyMemoryUpdate(campaign: Campaign, update: MemoryUpdate): Campaign {
  let chapters = [...(campaign.chapters ?? []), ...(update.chapters ?? [])];
  let arcs = campaign.arcs ?? [];
  if (update.arc) {
    const folded = new Set(update.arc.chapterIds);
    const arcId = update.arc.arc.id;
    chapters = chapters.map((c) => (folded.has(c.id) ? { ...c, arcId } : c));
    arcs = [...arcs, update.arc.arc];
  }
  const newest = chapters.reduce((max, c) => Math.max(max, c.toTurn), 0);
  return {
    ...campaign,
    chapters,
    arcs,
    summaryThroughTurn: Math.max(campaign.summaryThroughTurn ?? 0, newest),
    updatedAt: Date.now(),
  };
}

/** "turns 13-24": 1-based and inclusive, for people and for the DM alike. */
export function turnRange(fromTurn: number, toTurn: number): string {
  return `${fromTurn + 1}-${toTurn}`;
}

/**
 * The `<memory>` block: arcs, then unfolded chapters, oldest first, each with
 * its turn range. Depends only on chapters and arcs, so it is stable between
 * summarizer runs and sits inside the cached prefix. Empty string if there is
 * nothing to remember yet.
 */
export function formatMemoryBlock(campaign: Campaign, profile: ContextProfile): string {
  const arcs = memoryArcs(campaign);
  const chapters = unfoldedChapters(campaign);
  const shownArcs = Number.isFinite(profile.arcsShown) ? arcs.slice(-profile.arcsShown) : arcs;
  const shownChapters = Number.isFinite(profile.chaptersShown)
    ? chapters.slice(-profile.chaptersShown)
    : chapters;
  if (shownArcs.length === 0 && shownChapters.length === 0) return "";
  const entry = (e: { fromTurn: number; toTurn: number; text: string }) =>
    `[turns ${turnRange(e.fromTurn, e.toTurn)}] ${e.text.trim()}`;
  const sections: string[] = [];
  if (shownArcs.length > 0) sections.push(`## Arcs\n${shownArcs.map(entry).join("\n\n")}`);
  if (shownChapters.length > 0) {
    sections.push(`## Chapters\n${shownChapters.map(entry).join("\n\n")}`);
  }
  return `<memory>\n${sections.join("\n\n")}\n</memory>`;
}

/**
 * Raw text of narrative messages [from, to), engine results included as
 * "(Engine: …)" lines, ready to hand to the chronicler.
 */
export function spanTranscript(history: ChatMessage[], from: number, to: number): string {
  const lines: string[] = [];
  let seen = 0;
  for (const m of history) {
    if (m.role === "tool") continue;
    if (m.role === "system") {
      const text = m.content.trim();
      // Engine results belong to the narrative message right before them.
      if (text.length > 0 && seen - 1 >= from && seen - 1 < to) lines.push(`(Engine: ${text})`);
      continue;
    }
    const index = seen++;
    if (index < from || index >= to) continue;
    lines.push(`${m.role === "dm" ? "DM" : "Player"}: ${m.content.trim()}`);
  }
  return lines.join("\n\n");
}
