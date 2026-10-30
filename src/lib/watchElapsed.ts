/**
 * Call `onElapsed` once `thresholdMs` have passed since `since` (ms epoch).
 * Judged by the clock, not by one long timer: a hidden tab throttles timers and
 * a sleeping laptop stops them, so the check also re-runs when the tab becomes
 * visible again. Returns a cleanup that cancels everything.
 */
export function watchElapsed(since: number, thresholdMs: number, onElapsed: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const check = () => {
    // The handle of the callback that is running is dead: forget it first.
    timer = undefined;
    if (done) return;
    const remaining = thresholdMs - (Date.now() - since);
    if (remaining <= 0) {
      done = true;
      stop();
      onElapsed();
      return;
    }
    timer = setTimeout(check, remaining);
  };
  const onVisibility = () => {
    if (document.visibilityState !== "visible") return;
    clear();
    check();
  };
  function stop() {
    done = true;
    clear();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }
  check();
  return stop;
}
