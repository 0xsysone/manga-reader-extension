/**
 * One content-script session on a page: detects the chapter (with retries), offers or opens the reader,
 * follows single-page-app URL changes, and hands state over to the next page on chapter navigation.
 */
import { chapterPositionKey } from '@/services/storage';
import type { NavigationIntent } from '@/services/tab-state';
import type {
  Chapter,
  ChapterDirection,
  ChapterStatus,
  InPageNavigation,
  ReaderCallbacks,
  ReaderHandle,
  Settings,
} from '@/shared/types';
import type { SessionEnvironment } from './environment';
import { watchLivePages, type LiveWatch } from './live-notices';
import { resolveStartPage } from './start-page';

/** Delays before detecting again when nothing was found (pages loading their images late). */
export const DETECTION_RETRY_DELAYS_MS: readonly number[] = [1200, 3000];

/** After a single-page-app URL change, time left to the site to start rendering the new page. */
export const URL_CHANGE_SETTLE_MS = 300;

/** A chapter navigation that did not unload the page is considered over after this delay. */
export const NAVIGATION_TIMEOUT_MS = 15_000;

/** Pages used to recognise a chapter still left in the DOM after a URL change. */
const SIGNATURE_PAGE_COUNT = 3;

const NO_INTENT: NavigationIntent = { autostart: false, openAtEndPath: null };

/** Identity of the page for URL-change purposes (the hash is ignored, like before). */
function pageKey(url: URL): string {
  return url.pathname + url.search;
}

function pageSourceKey(chapter: Chapter, index: number): string {
  const source = chapter.pages[index]?.source;
  if (source?.kind === 'url') return source.url;
  if (source?.kind === 'element') return source.element.currentSrc || source.element.src;
  return '';
}

/** Fingerprint of a chapter's first pages, to reject the previous chapter's DOM after a URL change. */
export function chapterSignature(chapter: Chapter): string {
  const count = Math.min(SIGNATURE_PAGE_COUNT, chapter.pages.length);
  const sources = Array.from({ length: count }, (_, index) => pageSourceKey(chapter, index));
  return `${chapter.pages.length}\n${sources.join('\n')}`;
}

/** Drives the reader for the chapter shown by the current page. */
export class ChapterSession {
  private settings: Settings | null = null;
  private chapter: Chapter | null = null;
  private reader: ReaderHandle | null = null;
  private openTask: Promise<boolean> | null = null;
  private detection: { epoch: number; promise: Promise<Chapter | null> } | null = null;
  /** Incremented on every URL change: results of older async work are dropped. */
  private epoch = 0;
  private retryTimer: number | null = null;
  private navigationTimer: number | null = null;
  private navigating = false;
  private intent: NavigationIntent = NO_INTENT;
  private legacyPosition: number | null = null;
  private lastPageKey: string;
  private urlChangedWhileOpen = false;
  private previousSignature: string | null = null;
  private liveWatch: LiveWatch | null = null;
  private stopWatchingSettings: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly env: SessionEnvironment) {
    this.lastPageKey = pageKey(env.location());
  }

  /** Consumes the hand-off of the previous page, loads the settings and starts detecting. */
  async start(): Promise<void> {
    this.intent = this.env.navigation.takeIntent();
    this.legacyPosition = this.env.navigation.takeLegacyPosition();
    this.stopWatchingSettings = this.env.settings.watch((settings) => {
      this.applySettings(settings);
    });
    this.settings = await this.env.settings.load();
    if (this.disposed) return;
    await this.runDetection(this.epoch, 0);
  }

  /** Current state, for the popup. Detects the chapter first if needed. */
  async status(): Promise<ChapterStatus> {
    const chapter = await this.ensureChapter();
    if (chapter && !this.reader) this.showLauncher();
    return {
      found: chapter !== null,
      open: this.reader?.isOpen ?? false,
      title: chapter?.meta.title ?? '',
      chapter: chapter?.meta.chapter ?? '',
      pageCount: chapter?.pages.length ?? 0,
    };
  }

  /** Opens the reader on the detected chapter. Resolves to `true` when the reader is open. */
  async open(): Promise<boolean> {
    if (this.reader?.isOpen) return true;
    if (!(await this.ensureChapter())) return false;
    this.openTask ??= this.openReader().finally(() => {
      this.openTask = null;
    });
    return this.openTask;
  }

  /**
   * Handles a URL change made by the site without loading a new page. `newUrl` comes from the event: with
   * the Navigation API, `location` still shows the old URL when it fires.
   */
  handleLocationChange(newUrl: URL = this.env.location()): void {
    if (this.disposed) return;
    const key = pageKey(newUrl);
    if (key === this.lastPageKey) return;
    if (this.reader) {
      // The reader covers the page: the change is applied once it closes.
      this.urlChangedWhileOpen = true;
      return;
    }
    this.lastPageKey = key;
    this.resetForNewPage();
  }

  /** Stops everything: timers, live watch, reader, launcher, settings watch. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch++;
    this.cancelRetry();
    this.clearNavigation();
    this.stopLiveWatch();
    this.stopWatchingSettings?.();
    const reader = this.reader;
    this.reader = null;
    if (reader?.isOpen) reader.close();
    this.env.launcher.hide();
  }

  private applySettings(settings: Settings): void {
    this.settings = settings;
    this.reader?.updateSettings(settings);
  }

  private async ensureChapter(): Promise<Chapter | null> {
    if (this.chapter) return this.chapter;
    const epoch = this.epoch;
    const found = await this.detectOnce();
    if (!this.isCurrent(epoch)) return null;
    return this.adopt(found);
  }

  /** Keeps a chapter found by a concurrent detection, else installs `found`. */
  private adopt(found: Chapter | null): Chapter | null {
    this.chapter ??= found;
    return this.chapter;
  }

  /** `false` once the URL changed (new epoch) or the session was disposed. */
  private isCurrent(epoch: number): boolean {
    return epoch === this.epoch && !this.disposed;
  }

  /** One detection per epoch at a time; concurrent callers share it. */
  private detectOnce(): Promise<Chapter | null> {
    const epoch = this.epoch;
    if (this.detection?.epoch === epoch) return this.detection.promise;
    const promise = this.safeDetect().then((chapter) => (chapter && this.isStale(chapter) ? null : chapter));
    this.detection = { epoch, promise };
    void promise.finally(() => {
      if (this.detection?.promise === promise) this.detection = null;
    });
    return promise;
  }

  private async safeDetect(): Promise<Chapter | null> {
    try {
      return await this.env.detect();
    } catch (error) {
      this.env.log('detection failed', error);
      return null;
    }
  }

  /** `true` for the previous URL's chapter still in the DOM right after a URL change. */
  private isStale(chapter: Chapter): boolean {
    return this.previousSignature !== null && chapterSignature(chapter) === this.previousSignature;
  }

  private async runDetection(epoch: number, attempt: number): Promise<void> {
    const chapter = await this.ensureChapter();
    if (!this.isCurrent(epoch)) return;
    if (!chapter) {
      this.scheduleRetry(epoch, attempt);
      return;
    }
    if (this.reader || this.openTask) return;
    const { autostart } = this.intent;
    this.intent = { ...this.intent, autostart: false };
    // A heuristic detection offers the reader rather than imposing it.
    if (autostart || (this.settings?.autoOpen === true && chapter.confident)) await this.open();
    else this.showLauncher();
  }

  private scheduleRetry(epoch: number, attempt: number): void {
    const delay = DETECTION_RETRY_DELAYS_MS[attempt];
    if (delay === undefined) return;
    this.cancelRetry();
    this.retryTimer = this.env.timers.setTimeout(() => {
      this.retryTimer = null;
      void this.runDetection(epoch, attempt + 1);
    }, delay);
  }

  private cancelRetry(): void {
    if (this.retryTimer === null) return;
    this.env.timers.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private resetForNewPage(): void {
    this.epoch++;
    this.cancelRetry();
    this.stopLiveWatch();
    this.previousSignature = this.chapter ? chapterSignature(this.chapter) : null;
    this.chapter = null;
    this.intent = NO_INTENT;
    this.legacyPosition = null;
    this.urlChangedWhileOpen = false;
    this.env.launcher.hide();
    const epoch = this.epoch;
    this.retryTimer = this.env.timers.setTimeout(() => {
      this.retryTimer = null;
      void this.runDetection(epoch, 0);
    }, URL_CHANGE_SETTLE_MS);
  }

  private showLauncher(): void {
    const chapter = this.chapter;
    if (!chapter || this.reader || this.disposed) return;
    this.env.launcher
      .show({
        pageCount: chapter.pages.length,
        onOpen: () => {
          void this.open();
        },
      })
      .catch((error: unknown) => {
        this.env.log('launcher failed', error);
      });
  }

  private positionKey(chapter: Chapter): string {
    return chapterPositionKey(this.env.location(), chapter.meta.chapter);
  }

  private async startPageFor(chapter: Chapter): Promise<number> {
    const saved = (await this.env.positions.load(this.positionKey(chapter))) ?? this.legacyPosition;
    this.legacyPosition = null;
    const openAtEnd = this.intent.openAtEndPath === this.env.location().pathname;
    this.intent = { ...this.intent, openAtEndPath: null };
    return resolveStartPage({
      pageCount: chapter.pages.length,
      savedPage: saved,
      siteStartPage: chapter.startPage,
      openAtEnd,
    });
  }

  private async openReader(): Promise<boolean> {
    const chapter = this.chapter;
    if (!chapter) return false;
    const epoch = this.epoch;
    const startPage = await this.startPageFor(chapter);
    const settings = this.settings ?? (await this.env.settings.load());
    if (!this.isCurrent(epoch) || chapter !== this.chapter) return false;
    this.env.launcher.hide();
    const reader = await this.env.openReader({ chapter, settings, startPage, callbacks: this.callbacks() });
    if (!this.isCurrent(epoch)) {
      reader.close();
      return false;
    }
    this.reader = reader;
    this.startLiveWatch(chapter, reader);
    return true;
  }

  private callbacks(): ReaderCallbacks {
    return {
      onSettingsChange: (settings) => {
        this.settings = settings;
        this.env.settings.save(settings).catch((error: unknown) => {
          this.env.log('saving settings failed', error);
        });
      },
      onPageChange: (page) => {
        if (this.chapter) void this.env.positions.save(this.positionKey(this.chapter), page);
      },
      onNavigateChapter: (direction) => {
        this.navigateChapter(direction);
      },
      onClose: () => {
        this.handleReaderClosed();
      },
    };
  }

  private handleReaderClosed(): void {
    if (!this.reader) return;
    this.reader = null;
    this.stopLiveWatch();
    if (this.disposed) return;
    if (this.urlChangedWhileOpen) {
      this.urlChangedWhileOpen = false;
      this.handleLocationChange();
    }
    this.showLauncher();
  }

  private navigateChapter(direction: ChapterDirection): void {
    const chapter = this.chapter;
    // A navigation is already running (key held down): extra requests would skip chapters.
    if (this.navigating || !chapter || !this.reader) return;
    if (chapter.inPage) {
      void this.switchInPage(chapter.inPage, direction);
      return;
    }
    const url = direction === 'prev' ? chapter.meta.prevUrl : chapter.meta.nextUrl;
    if (!url) {
      this.showUnavailable();
      return;
    }
    this.startNavigation();
    this.env.navigation.leaveIntent({
      autostart: true,
      openAtEndPath: direction === 'prev' ? new URL(url, this.env.location()).pathname : null,
    });
    this.env.navigation.go(url);
  }

  private startNavigation(): void {
    this.navigating = true;
    this.navigationTimer = this.env.timers.setTimeout(() => {
      this.clearNavigation();
    }, NAVIGATION_TIMEOUT_MS);
  }

  private clearNavigation(): void {
    this.navigating = false;
    if (this.navigationTimer === null) return;
    this.env.timers.clearTimeout(this.navigationTimer);
    this.navigationTimer = null;
  }

  /** Chapter switch done by the site without loading a page: the reader stays open. */
  private async switchInPage(inPage: InPageNavigation, direction: ChapterDirection): Promise<void> {
    this.startNavigation();
    const epoch = this.epoch;
    try {
      const moved = await inPage.go(direction);
      const fresh = moved ? await this.safeDetect() : null;
      const reader = this.reader;
      if (!this.isCurrent(epoch) || !reader) return;
      if (!fresh) {
        this.showUnavailable();
        return;
      }
      this.stopLiveWatch();
      this.chapter = fresh;
      const startPage = direction === 'prev' ? Math.max(0, fresh.pages.length - 1) : 0;
      reader.replaceChapter(fresh, startPage);
      this.startLiveWatch(fresh, reader);
    } catch (error) {
      this.env.log('in-page navigation failed', error);
      this.showUnavailable();
    } finally {
      this.clearNavigation();
    }
  }

  private showUnavailable(): void {
    this.reader?.showNotice({
      title: this.env.text('chapterUnavailable'),
      detail: this.env.text('chapterUnavailableSub'),
    });
  }

  private startLiveWatch(chapter: Chapter, reader: ReaderHandle): void {
    this.stopLiveWatch();
    if (chapter.live) this.liveWatch = watchLivePages(chapter.live, reader, this.env);
  }

  private stopLiveWatch(): void {
    this.liveWatch?.dispose();
    this.liveWatch = null;
  }
}
