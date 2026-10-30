import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchElapsed } from "./watchElapsed";

function stubDocument(): { setVisibility: (v: "visible" | "hidden") => void } {
  const target = new EventTarget();
  const doc = {
    visibilityState: "visible" as "visible" | "hidden",
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  };
  vi.stubGlobal("document", doc);
  return {
    setVisibility(v) {
      doc.visibilityState = v;
      target.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("watchElapsed", () => {
  it("fires once when the threshold passes", () => {
    const fn = vi.fn();
    watchElapsed(Date.now(), 20_000, fn);
    vi.advanceTimersByTime(19_999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("counts from `since`, not from now", () => {
    const fn = vi.fn();
    watchElapsed(Date.now() - 15_000, 20_000, fn);
    vi.advanceTimersByTime(5_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fires immediately when the threshold has already passed", () => {
    const fn = vi.fn();
    watchElapsed(Date.now() - 60_000, 20_000, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("the cleanup cancels it", () => {
    const fn = vi.fn();
    const stop = watchElapsed(Date.now(), 20_000, fn);
    stop();
    vi.advanceTimersByTime(60_000);
    expect(fn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("re-checks the clock when the tab becomes visible (timers were frozen)", () => {
    const doc = stubDocument();
    const fn = vi.fn();
    watchElapsed(Date.now(), 20_000, fn);
    doc.setVisibility("hidden");
    vi.setSystemTime(Date.now() + 120_000); // slept: the timer never ticked
    expect(fn).not.toHaveBeenCalled();
    doc.setVisibility("visible");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
