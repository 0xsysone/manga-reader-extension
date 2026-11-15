import { isWide } from '@/domain/spreads';
import type { Page } from '@/shared/types';
import { Disposer } from './disposer';

/** Pages probed for their size before the book is first laid out, before / after the start page. */
export const PROBE_BEHIND = 2;
export const PROBE_AHEAD = 6;
/** Interval between two looks at the probed images' natural size. */
const PROBE_POLL_MS = 25;
/** Pages preloaded on each side of the current one. */
const PRELOAD_RADIUS = 8;
/** Nearest pages requested at once; the rest of the window follows one by one when the browser is idle. */
const PRELOAD_EAGER_COUNT = 6;
/** Delay standing in for `requestIdleCallback` where it is missing. */
const IDLE_FALLBACK_MS = 200;
/** Loaded images further than this from the current page are dropped from the cache. */
const CACHE_KEEP_RADIUS = 24;
/** A page that failed to load is not requested again before this delay. */
const RETRY_AFTER_MS = 15_000;
/** Ratio changes smaller than this are rounding noise. */
const RATIO_TOLERANCE = 0.02;
/** Longest side of a scrubber thumbnail (px). */
const THUMBNAIL_SIZE = 240;
/** Thumbnails kept in memory (least recently used dropped first). */
const THUMBNAIL_CACHE_SIZE = 40;

interface ImageEntry {
  image: HTMLImageElement;
  state: 'loading' | 'ok';
  promise: Promise<HTMLImageElement | null>;
  /** Resolves `promise` (idempotent). */
  done: (image: HTMLImageElement | null) => void;
}

interface ElementWait {
  promise: Promise<void>;
  resolve: () => void;
}

/** Called when a page's real ratio is learned; `wideChanged` when it flips between portrait and landscape. */
export type RatioListener = (index: number, wideChanged: boolean) => void;

const isDecoded = (element: HTMLImageElement): boolean => element.complete && element.naturalWidth > 0;
const ratioOf = (element: HTMLImageElement): number =>
  element.naturalWidth > 0 && element.naturalHeight > 0 ? element.naturalWidth / element.naturalHeight : 0;

/**
 * Loads the pages of one chapter: image cache, ratio probing, a single bounded preload chain and scrubber
 * thumbnails. One loader per chapter: disposing it stops every pending load and probe, and late `load`
 * events of its images are ignored.
 */
export class PageLoader {
  /** Mutable copies of the chapter pages (ratios are filled in as images arrive). */
  readonly pages: Page[];
  private readonly disposer = new Disposer();
  private readonly images = new Map<number, ImageEntry>();
  private readonly elementWaits = new Map<number, ElementWait>();
  private readonly failedAt = new Map<number, number>();
  private readonly thumbnails = new Map<number, HTMLCanvasElement>();
  private center = 0;
  private chainRunning = false;

  constructor(
    pages: readonly Page[],
    private readonly onRatio: RatioListener,
  ) {
    this.pages = pages.map((page) => ({ source: page.source, ratio: page.ratio }));
  }

  get count(): number {
    return this.pages.length;
  }

  /** Resolves when page `index` can be drawn (or failed to load). Never rejects. */
  load(index: number): Promise<void> {
    const page = this.pages[index];
    if (!page || this.disposer.isDisposed) return Promise.resolve();
    if (page.source.kind !== 'url') {
      if (page.source.kind === 'element' && isDecoded(page.source.element)) return Promise.resolve();
      return this.waitForElement(index).promise;
    }
    return this.loadImage(index, page, page.source.url).promise.then(() => undefined);
  }

  /** Like {@link load}, and also decodes the image off the main thread when possible. */
  async loadDecoded(index: number): Promise<void> {
    await this.load(index);
    const entry = this.images.get(index);
    if (entry?.state === 'ok') await entry.image.decode().catch(() => undefined);
  }

  /** `true` once page `index` has been downloaded (URL pages) or decoded by the site (element pages). */
  isLoaded(index: number): boolean {
    const page = this.pages[index];
    if (!page) return false;
    if (page.source.kind === 'url') return this.images.get(index)?.state === 'ok';
    return page.source.kind === 'element' && isDecoded(page.source.element);
  }

  /**
   * Waits until the size of the pages around `center` is known (the natural size arrives long before the
   * download ends), or `timeout` ms. Pages further away get their ratio lazily, as they load.
   */
  probeRatios(center: number, timeout: number): Promise<void> {
    const pending: number[] = [];
    for (let index = center - PROBE_BEHIND; index <= center + PROBE_AHEAD; index++) {
      const page = this.pages[index];
      if (page?.source.kind === 'url' && !page.ratio) {
        this.loadImage(index, page, page.source.url);
        pending.push(index);
      }
    }
    if (pending.length === 0 || this.disposer.isDisposed) return Promise.resolve();
    const deadline = performance.now() + timeout;
    return new Promise((resolve) => {
      const remove = this.disposer.add(resolve);
      const tick = (): void => {
        const missing = pending.filter((index) => {
          const page = this.pages[index];
          const entry = this.images.get(index);
          if (!page || page.ratio || !entry) return false;
          const ratio = ratioOf(entry.image);
          if (ratio) {
            page.ratio = ratio;
            return false;
          }
          return !entry.image.complete;
        });
        if (missing.length === 0 || performance.now() >= deadline) remove();
        else this.disposer.timeout(tick, PROBE_POLL_MS);
      };
      tick();
    });
  }

  /** Preloads the pages around `page` (nearest first) and frees the far ones. */
  preloadAround(page: number): void {
    if (this.disposer.isDisposed) return;
    this.center = page;
    this.evictFarImages();
    for (const index of this.preloadOrder().slice(0, PRELOAD_EAGER_COUNT)) {
      if (this.isDue(index)) void this.load(index);
    }
    if (!this.chainRunning) {
      this.chainRunning = true;
      this.disposer.idle(() => {
        this.preloadStep();
      }, IDLE_FALLBACK_MS);
    }
  }

  /** The site decoded page `index` (live sources). Returns `true` when the page changed. */
  setElement(index: number, element: HTMLImageElement): boolean {
    const page = this.pages[index];
    if (!page || page.source.kind === 'url') return false;
    if (page.source.kind === 'element' && page.source.element === element) return false;
    page.source = { kind: 'element', element };
    this.thumbnails.delete(index);
    const ratio = ratioOf(element);
    if (ratio && Math.abs(ratio - page.ratio) > RATIO_TOLERANCE) this.updateRatio(index, page, ratio);
    const wait = this.elementWaits.get(index);
    if (wait) {
      this.elementWaits.delete(index);
      wait.resolve();
    }
    return true;
  }

  /** A small canvas of page `index` for the scrubber preview, `null` when the page cannot be drawn yet. */
  async thumbnail(index: number): Promise<HTMLCanvasElement | null> {
    const cached = this.thumbnails.get(index);
    if (cached) {
      this.thumbnails.delete(index);
      this.thumbnails.set(index, cached);
      return cached;
    }
    await this.load(index);
    const page = this.pages[index];
    if (!page || this.disposer.isDisposed) return null;
    const source =
      page.source.kind === 'url'
        ? this.images.get(index)?.image
        : page.source.kind === 'element'
          ? page.source.element
          : undefined;
    if (!source || !isDecoded(source)) return null;
    const scale = THUMBNAIL_SIZE / Math.max(source.naturalWidth, source.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
    try {
      canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
    } catch {
      return null;
    }
    this.thumbnails.set(index, canvas);
    for (const [key, old] of this.thumbnails) {
      if (this.thumbnails.size <= THUMBNAIL_CACHE_SIZE) break;
      old.width = 0;
      old.height = 0;
      this.thumbnails.delete(key);
    }
    return canvas;
  }

  /** Stops every load, probe and preload; late image events are ignored. */
  dispose(): void {
    this.disposer.dispose();
    for (const entry of this.images.values()) this.detach(entry);
    this.images.clear();
    for (const wait of this.elementWaits.values()) wait.resolve();
    this.elementWaits.clear();
    for (const canvas of this.thumbnails.values()) {
      canvas.width = 0;
      canvas.height = 0;
    }
    this.thumbnails.clear();
  }

  private loadImage(index: number, page: Page, url: string): ImageEntry {
    const existing = this.images.get(index);
    if (existing) return existing;
    const image = new Image();
    image.decoding = 'async';
    let resolve: (image: HTMLImageElement | null) => void = () => undefined;
    const promise = new Promise<HTMLImageElement | null>((done) => {
      resolve = done;
    });
    const entry: ImageEntry = { image, state: 'loading', promise, done: (result) => resolve(result) };
    // `page` is captured: a load that finishes after a chapter swap or an eviction changes nothing.
    const isCurrent = (): boolean =>
      !this.disposer.isDisposed && this.pages[index] === page && this.images.get(index) === entry;
    image.onload = () => {
      if (!isCurrent()) return;
      entry.state = 'ok';
      this.failedAt.delete(index);
      const ratio = ratioOf(image);
      if (ratio && Math.abs(ratio - page.ratio) > RATIO_TOLERANCE) this.updateRatio(index, page, ratio);
      entry.done(image);
    };
    image.onerror = () => {
      if (!isCurrent()) return;
      // Forget the failure so the page is requested again later instead of staying broken.
      this.failedAt.set(index, performance.now());
      this.images.delete(index);
      this.detach(entry);
    };
    this.images.set(index, entry);
    image.src = url;
    return entry;
  }

  private updateRatio(index: number, page: Page, ratio: number): void {
    const wasWide = isWide(page);
    page.ratio = ratio;
    this.onRatio(index, wasWide !== isWide(page));
  }

  private waitForElement(index: number): ElementWait {
    let wait = this.elementWaits.get(index);
    if (!wait) {
      let resolve: () => void = () => undefined;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      wait = { promise, resolve };
      this.elementWaits.set(index, wait);
    }
    return wait;
  }

  /** Stops listening to an image and releases whoever waits for it. */
  private detach(entry: ImageEntry): void {
    entry.image.onload = null;
    entry.image.onerror = null;
    entry.done(entry.state === 'ok' ? entry.image : null);
  }

  /** Pages of the preload window, nearest to the current one first. */
  private preloadOrder(): number[] {
    const order: number[] = [];
    for (let distance = 0; distance <= PRELOAD_RADIUS; distance++) {
      for (const index of distance === 0 ? [this.center] : [this.center + distance, this.center - distance]) {
        if (index >= 0 && index < this.pages.length) order.push(index);
      }
    }
    return order;
  }

  private isDue(index: number): boolean {
    const page = this.pages[index];
    if (page?.source.kind !== 'url' || this.images.has(index)) return false;
    const failed = this.failedAt.get(index);
    return failed === undefined || performance.now() - failed >= RETRY_AFTER_MS;
  }

  /** One link of the single preload chain: load the nearest due page, then continue when idle. */
  private preloadStep(): void {
    const next = this.preloadOrder().find((index) => this.isDue(index));
    if (next === undefined || this.disposer.isDisposed) {
      this.chainRunning = false;
      return;
    }
    void this.load(next).then(() => {
      if (this.disposer.isDisposed) return;
      this.disposer.idle(() => {
        this.preloadStep();
      }, IDLE_FALLBACK_MS);
    });
  }

  private evictFarImages(): void {
    for (const [index, entry] of this.images) {
      if (Math.abs(index - this.center) <= CACHE_KEEP_RADIUS) continue;
      this.detach(entry);
      this.images.delete(index);
    }
  }
}
