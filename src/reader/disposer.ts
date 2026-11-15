/**
 * Owns every resource a reader part acquires (listeners, timers, frames, idle callbacks, subscriptions)
 * and releases all of them at once. Disposing is idempotent; nothing can be registered afterwards.
 */
export class Disposer {
  private readonly controller = new AbortController();
  private readonly cleanups = new Set<() => void>();
  private readonly timeouts = new Set<number>();
  private readonly frames = new Set<number>();
  private readonly idles = new Set<number>();

  /** Aborted when the disposer is disposed: pass it to `fetch`, listeners or animations. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get isDisposed(): boolean {
    return this.controller.signal.aborted;
  }

  /** Registers a cleanup; returns a function that runs it early (and only once). */
  add(cleanup: () => void): () => void {
    if (this.isDisposed) {
      cleanup();
      return () => undefined;
    }
    let done = false;
    const run = (): void => {
      if (done) return;
      done = true;
      this.cleanups.delete(run);
      cleanup();
    };
    this.cleanups.add(run);
    return run;
  }

  /** `addEventListener` removed on dispose (typed after the target's event map). */
  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    handler: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen<K extends keyof MediaQueryListEventMap>(
    target: MediaQueryList,
    type: K,
    handler: (event: MediaQueryListEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen(
    target: EventTarget,
    type: string,
    handler: (event: never) => void,
    options: AddEventListenerOptions = {},
  ): void {
    if (this.isDisposed) return;
    target.addEventListener(type, handler as unknown as EventListener, { ...options, signal: this.signal });
  }

  /** `setTimeout` cleared on dispose. */
  timeout(callback: () => void, delay: number): number {
    if (this.isDisposed) return 0;
    const id = window.setTimeout(() => {
      this.timeouts.delete(id);
      callback();
    }, delay);
    this.timeouts.add(id);
    return id;
  }

  clearTimeout(id: number | undefined): void {
    if (id === undefined) return;
    window.clearTimeout(id);
    this.timeouts.delete(id);
  }

  /** `requestAnimationFrame` cancelled on dispose. */
  frame(callback: () => void): number {
    if (this.isDisposed) return 0;
    const id = window.requestAnimationFrame(() => {
      this.frames.delete(id);
      callback();
    });
    this.frames.add(id);
    return id;
  }

  /** `requestIdleCallback` (or a timeout where it is missing) cancelled on dispose. */
  idle(callback: () => void, fallbackDelay: number): void {
    if (this.isDisposed) return;
    if (typeof window.requestIdleCallback !== 'function') {
      this.timeout(callback, fallbackDelay);
      return;
    }
    const id = window.requestIdleCallback(() => {
      this.idles.delete(id);
      callback();
    });
    this.idles.add(id);
  }

  /** A disposer released together with this one (or earlier, on its own). */
  child(): Disposer {
    const child = new Disposer();
    const detach = this.add(() => {
      child.dispose();
    });
    child.add(detach);
    return child;
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.controller.abort();
    for (const id of this.timeouts) window.clearTimeout(id);
    for (const id of this.frames) window.cancelAnimationFrame(id);
    for (const id of this.idles) window.cancelIdleCallback(id);
    this.timeouts.clear();
    this.frames.clear();
    this.idles.clear();
    const cleanups = [...this.cleanups].reverse();
    this.cleanups.clear();
    for (const cleanup of cleanups) cleanup();
  }
}
