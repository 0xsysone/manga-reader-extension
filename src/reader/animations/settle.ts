import { SETTLE_GUARD_MS } from './timing';

function plannedDuration(animation: Animation): number {
  const timing = animation.effect?.getTiming();
  const duration = Number(timing?.duration) || 0;
  return duration / Math.abs(animation.playbackRate || 1);
}

function finishQuietly(animation: Animation): void {
  try {
    animation.finish();
  } catch {
    // Already cancelled, or infinite: nothing to finish.
  }
}

function cancelQuietly(animation: Animation): void {
  try {
    animation.cancel();
  } catch {
    // Element already gone.
  }
}

/**
 * Resolves when every animation has finished. If the timeline is frozen (background tab), the animations are
 * finished by force after their planned duration, so navigation never blocks. When `signal` aborts (the reader
 * closes, the chapter is replaced), the animations are cancelled and the promise resolves at once: callers must
 * check `signal.aborted` before touching the DOM again.
 */
export function settle(animations: readonly Animation[], signal: AbortSignal): Promise<void> {
  if (animations.length === 0) return Promise.resolve();
  if (signal.aborted) {
    animations.forEach(cancelQuietly);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let guard = 0;
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(guard);
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = (): void => {
      animations.forEach(cancelQuietly);
      done();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    const longest = Math.max(0, ...animations.map(plannedDuration));
    guard = window.setTimeout(() => {
      animations.forEach(finishQuietly);
      done();
    }, longest + SETTLE_GUARD_MS);
    void Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(done);
  });
}
