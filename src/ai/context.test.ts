import { describe, expect, it } from "vitest";
import {
  CLOUD_PROFILE,
  LOCAL_PROFILE,
  estimateTokens,
  narrativeCosts,
  profileFor,
  promptWindowStart,
  windowStart,
  type ContextProfile,
} from "./context";
import type { ChatMessage } from "@/schemas/campaign";

/** A small profile so tests can use readable numbers. */
const P: ContextProfile = { ...CLOUD_PROFILE, windowHigh: 100, windowLow: 60 };
const sum = (costs: number[], from: number): number =>
  costs.slice(from).reduce((a, b) => a + b, 0);

function msg(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: "x", campaignId: "c", role, content, toolCallIds: [], diceRollIds: [], ts: 0 };
}

describe("profiles", () => {
  it("uses the small profile only for ollama", () => {
    expect(profileFor("ollama")).toBe(LOCAL_PROFILE);
    for (const id of ["claude", "openai", "gemini"] as const) expect(profileFor(id)).toBe(CLOUD_PROFILE);
    expect(profileFor(null)).toBe(CLOUD_PROFILE);
    expect(profileFor(undefined)).toBe(CLOUD_PROFILE);
  });

  it("local is tighter than cloud on every axis", () => {
    expect(LOCAL_PROFILE.windowHigh).toBeLessThan(CLOUD_PROFILE.windowHigh);
    expect(LOCAL_PROFILE.triggeredBudget).toBeLessThan(CLOUD_PROFILE.triggeredBudget);
    expect(LOCAL_PROFILE.indexMax).toBeLessThan(CLOUD_PROFILE.indexMax);
    expect(CLOUD_PROFILE).toMatchObject({ windowHigh: 40_000, windowLow: 25_000, indexMax: 150 });
    expect(LOCAL_PROFILE).toMatchObject({ windowHigh: 5_000, windowLow: 3_000, chaptersShown: 4, arcsShown: 3 });
  });
});

describe("token costs", () => {
  it("estimates by length / 3.6, rounded up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(36))).toBe(10);
    expect(estimateTokens("a".repeat(37))).toBe(11);
  });

  it("charges engine results to the narrative message before them", () => {
    const costs = narrativeCosts([
      msg("player", "a".repeat(36)),
      msg("system", "Stealth: 17"),
      msg("tool", "ignored"),
      msg("dm", "b".repeat(36)),
    ]);
    expect(costs).toEqual([10 + estimateTokens("(Engine: Stealth: 17)"), 10]);
  });
});

describe("window with hysteresis", () => {
  const flat = (n: number, cost = 10) => Array.from({ length: n }, () => cost);

  it("keeps everything while within the high mark", () => {
    expect(windowStart(flat(10), P)).toBe(0);
    expect(windowStart(flat(0), P)).toBe(0);
  });

  it("slides only once past the high mark, and lands at or under the low mark", () => {
    expect(windowStart(flat(10), P)).toBe(0);
    // 11 x 10 = 110 > 100: drop until <= 60.
    const costs = flat(11);
    const start = windowStart(costs, P);
    expect(start).toBe(5);
    expect(sum(costs, start)).toBeLessThanOrEqual(P.windowLow);
  });

  it("holds the start steady between slides, so the prefix is byte-stable", () => {
    const starts: number[] = [];
    for (let n = 1; n <= 200; n++) starts.push(windowStart(flat(n), P));
    // Never moves backwards, and moves rarely: every slide frees ~40 tokens (4 messages).
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeGreaterThanOrEqual(starts[i - 1]!);
    const slides = starts.filter((s, i) => i > 0 && s !== starts[i - 1]).length;
    expect(slides).toBeLessThanOrEqual(200 / 4);
    expect(slides).toBeGreaterThan(0);
    // After the first slide the window always sits between low-ish and high.
    for (let n = 11; n <= 200; n++) {
      const size = sum(flat(n), starts[n - 1]!);
      expect(size).toBeLessThanOrEqual(P.windowHigh);
      expect(size).toBeGreaterThan(P.windowLow - 10);
    }
  });

  it("is a function of the prefix: appending never changes an earlier verdict's start unless it slides", () => {
    const costs = [30, 50, 40, 20, 20, 70, 10, 90, 15, 15];
    let prev = windowStart(costs.slice(0, 1), P);
    for (let n = 2; n <= costs.length; n++) {
      const cur = windowStart(costs.slice(0, n), P);
      if (cur !== prev) expect(sum(costs.slice(0, n), prev)).toBeGreaterThan(P.windowHigh);
      prev = cur;
    }
  });

  it("always keeps the newest message, even when it alone exceeds the budget", () => {
    expect(windowStart([10, 10, 500], P)).toBe(2);
  });
});

describe("prompt window floor", () => {
  const costs = Array.from({ length: 30 }, () => 10); // 300 tokens

  it("keeps unsummarized turns verbatim until memory catches up", () => {
    const stepped = windowStart(costs, P);
    expect(stepped).toBeGreaterThan(0);
    // Memory covers nothing, but the hard cap (150) still bounds the window.
    expect(promptWindowStart(costs, 0, P)).toBe(30 - 15);
    // Memory covers the first 20 turns, so the floor is above the cap.
    expect(promptWindowStart(costs, 20, P)).toBe(Math.min(stepped, 20));
    expect(promptWindowStart(costs, 9999, P)).toBe(stepped);
  });

  it("never sends more than windowHigh x 1.5 tokens", () => {
    const start = promptWindowStart(Array.from({ length: 500 }, () => 10), 0, P);
    expect(sum(Array.from({ length: 500 }, () => 10), start)).toBeLessThanOrEqual(150);
  });

  it("leaves a short conversation whole", () => {
    expect(promptWindowStart([10, 10], 0, P)).toBe(0);
    expect(promptWindowStart([], 0, P)).toBe(0);
  });
});
