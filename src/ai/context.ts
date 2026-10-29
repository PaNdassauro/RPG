/**
 * Shared sizing rules for the verbatim history window and the rolling summary.
 *
 * The window slides in steps instead of one message per turn, so the message
 * prefix stays byte-identical between turns (prompt-cache friendly) and the
 * summarizer only has to fire once per step. Counts are in narrative messages
 * (DM + player), the same unit `Campaign.summaryThroughTurn` uses.
 */

/** Most narrative messages ever sent verbatim in the normal case. */
export const WINDOW_MAX = 34;
/** How many messages leave the window at once when it overflows. */
export const WINDOW_STEP = 10;
/** Hard cap when the summarizer is behind (never send more than this). */
export const WINDOW_HARD_MAX = 60;
/** Summarize only when at least this many new turns have left the window. */
export const SUMMARY_MIN_NEW = 10;

/**
 * Index of the first narrative message in the sliding window. The window holds
 * between WINDOW_MAX - WINDOW_STEP + 1 and WINDOW_MAX messages.
 */
export function windowStart(
  narrativeCount: number,
  max: number = WINDOW_MAX,
  step: number = WINDOW_STEP,
): number {
  if (narrativeCount <= max) return 0;
  return Math.ceil((narrativeCount - max) / step) * step;
}

/**
 * Where the prompt's verbatim window actually starts. Turns are kept verbatim
 * until the rolling summary covers them, so a slow or failed summarizer never
 * opens a gap in the DM's memory (bounded by WINDOW_HARD_MAX).
 */
export function promptWindowStart(
  narrativeCount: number,
  summaryThroughTurn: number,
  max: number = WINDOW_MAX,
): number {
  const stepped = windowStart(narrativeCount, max);
  const floor = Math.max(summaryThroughTurn, narrativeCount - WINDOW_HARD_MAX, 0);
  return Math.min(stepped, floor);
}
