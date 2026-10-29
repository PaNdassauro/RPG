/**
 * Shared sizing rules for the verbatim history window.
 *
 * The window is measured in tokens and slides with hysteresis: it grows until
 * it exceeds `windowHigh`, then drops its oldest messages in one go until it
 * fits `windowLow`. Between slides the start index is constant, so the message
 * prefix stays byte-identical turn to turn (prompt-cache friendly) and the
 * summarizer only has to fire when a slide actually happens. Indices are in
 * narrative messages (DM + player), the unit `Campaign.summaryThroughTurn` uses.
 */
import type { ChatMessage } from "@/schemas/campaign";
import type { ProviderId } from "./provider";

export interface ContextProfile {
  /** The verbatim window slides once it grows past this many tokens... */
  windowHigh: number;
  /** ...down to at most this many. */
  windowLow: number;
  /** Token budget for triggered (full-detail) codex entries in the <state> tail. */
  triggeredBudget: number;
  /** Most entries listed (names only) in the codex index. */
  indexMax: number;
  /** Newest unfolded chapters shown in <memory> (Infinity = all). */
  chaptersShown: number;
  /** Newest arcs shown in <memory> (Infinity = all). */
  arcsShown: number;
}

export const CLOUD_PROFILE: ContextProfile = {
  windowHigh: 40_000,
  windowLow: 25_000,
  triggeredBudget: 1_500,
  indexMax: 150,
  chaptersShown: Infinity,
  arcsShown: Infinity,
};

/** Small local models: tight context, so everything is capped harder. */
export const LOCAL_PROFILE: ContextProfile = {
  windowHigh: 5_000,
  windowLow: 3_000,
  triggeredBudget: 600,
  indexMax: 40,
  chaptersShown: 4,
  arcsShown: 3,
};

/** Local (Ollama) gets the small profile; every other provider, and the stub, the cloud one. */
export function profileFor(providerId: ProviderId | null | undefined): ContextProfile {
  return providerId === "ollama" ? LOCAL_PROFILE : CLOUD_PROFILE;
}

/** Cheap token estimate: no tokenizer in the browser, and this errs a little high. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.6);
}

/**
 * Prompt cost of every narrative message (DM + player), in order. A message's
 * cost includes the engine result lines that follow it, because the prompt
 * folds those in as "(Engine: …)".
 */
export function narrativeCosts(history: ChatMessage[]): number[] {
  const costs: number[] = [];
  for (const m of history) {
    if (m.role === "tool") continue;
    if (m.role === "system") {
      const text = m.content.trim();
      if (text.length === 0 || costs.length === 0) continue;
      costs[costs.length - 1]! += estimateTokens(`(Engine: ${text})`);
      continue;
    }
    costs.push(estimateTokens(m.content));
  }
  return costs;
}

/**
 * Index of the first narrative message in the sliding window. Stateless: it
 * replays the growth of the conversation, so the result depends only on the
 * messages that exist, and is the same on every turn between slides.
 */
export function windowStart(costs: number[], profile: ContextProfile): number {
  let start = 0;
  let sum = 0;
  for (let i = 0; i < costs.length; i++) {
    sum += costs[i]!;
    if (sum <= profile.windowHigh) continue;
    // Always keep the newest message, even if it alone exceeds the budget.
    while (start < i && sum > profile.windowLow) sum -= costs[start++]!;
  }
  return start;
}

/** Hard cap multiplier on windowHigh when the summarizer is behind. */
const HARD_CAP_FACTOR = 1.5;

/**
 * Where the prompt's verbatim window actually starts. Turns are kept verbatim
 * until memory covers them, so a slow or failed summarizer never opens a gap
 * in the DM's recall (bounded by windowHigh × 1.5 tokens).
 */
export function promptWindowStart(
  costs: number[],
  summaryThroughTurn: number,
  profile: ContextProfile,
): number {
  const stepped = windowStart(costs, profile);
  const cap = profile.windowHigh * HARD_CAP_FACTOR;
  let hardStart = costs.length;
  let sum = 0;
  while (hardStart > 0 && sum + costs[hardStart - 1]! <= cap) sum += costs[--hardStart]!;
  // Never drop the newest message, even when it alone is over the cap.
  hardStart = Math.min(hardStart, Math.max(costs.length - 1, 0));
  const floor = Math.max(summaryThroughTurn, hardStart, 0);
  return Math.min(stepped, floor);
}
