import { describe, expect, it } from "vitest";
import { promptWindowStart, windowStart, WINDOW_HARD_MAX, WINDOW_MAX, WINDOW_STEP } from "./context";

describe("window sizing", () => {
  it("keeps everything while under the maximum", () => {
    expect(windowStart(0)).toBe(0);
    expect(windowStart(WINDOW_MAX)).toBe(0);
  });

  it("drops a whole step at a time", () => {
    expect(windowStart(WINDOW_MAX + 1)).toBe(WINDOW_STEP);
    expect(windowStart(WINDOW_MAX + WINDOW_STEP)).toBe(WINDOW_STEP);
    expect(windowStart(WINDOW_MAX + WINDOW_STEP + 1)).toBe(2 * WINDOW_STEP);
  });

  it("always leaves between max-step+1 and max messages", () => {
    for (let n = WINDOW_MAX + 1; n < 300; n++) {
      const size = n - windowStart(n);
      expect(size).toBeGreaterThan(WINDOW_MAX - WINDOW_STEP);
      expect(size).toBeLessThanOrEqual(WINDOW_MAX);
    }
  });

  it("keeps unsummarized turns verbatim until the summary catches up", () => {
    const n = WINDOW_MAX + 15;
    expect(promptWindowStart(n, 0)).toBe(0);
    expect(promptWindowStart(n, WINDOW_STEP)).toBe(WINDOW_STEP);
    expect(promptWindowStart(n, 9999)).toBe(windowStart(n));
  });

  it("never sends more than the hard maximum", () => {
    expect(promptWindowStart(500, 0)).toBe(500 - WINDOW_HARD_MAX);
  });
});
