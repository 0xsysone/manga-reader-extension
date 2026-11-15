/**
 * Domain types shared by every part of the extension.
 * This file is the contract between `domain/`, `sites/`, `reader/`, `content/` and the entrypoints.
 */

export type Direction = 'rtl' | 'ltr';
export type ViewMode = 'auto' | 'single' | 'double';
export type AnimationKind = 'flip' | 'slide' | 'none';
export type Theme = 'dark' | 'light';

export interface Settings {
  mode: ViewMode;
  direction: Direction;
  animation: AnimationKind;
  theme: Theme;
  /** In double-page mode, show the first page alone (like a book cover). */
  firstPageAlone: boolean;
  /** Open the reader automatically when a chapter is detected with confidence. */
  autoOpen: boolean;
}

/**
 * Where a page image comes from:
 * - `url`: a regular image URL;
 * - `element`: an `<img>` the site already decoded (its URL may be revoked);
 * - `pending`: not decoded yet, it will arrive through `LivePages.subscribe`.
 */
export type PageSource =
  { kind: 'url'; url: string } | { kind: 'element'; element: HTMLImageElement } | { kind: 'pending' };

export interface Page {
  source: PageSource;
  /** Width / height. `0` while unknown. */
  ratio: number;
}

/**
 * A group of pages shown together.
 * - `single`: single-page mode;
 * - `pair`: two portrait pages side by side;
 * - `wide`: one landscape image drawn across both sides;
 * - `lead`: a page alone that opens a run of pairs (cover, or before a wide page);
 * - `trail`: a lone last page.
 */
export type SpreadKind = 'single' | 'pair' | 'wide' | 'lead' | 'trail';

export interface Spread {
  kind: SpreadKind;
  /** Page indexes in reading order. */
  pages: number[];
}

export type PagePart = 'full' | 'left' | 'right';

export interface PageSlice {
  page: number;
  part: PagePart;
}

/** What each side of the open book shows. */
export interface SpreadSides {
  left: PageSlice | null;
  right: PageSlice | null;
}

export interface ChapterMeta {
  /** Series title. */
  title: string;
  /** Chapter number or label, `''` when unknown. */
  chapter: string;
  prevUrl: string | null;
  nextUrl: string | null;
  prevLabel: string | null;
  nextLabel: string | null;
  /** Series page (all chapters), when known. */
  seriesUrl: string | null;
}

export type ChapterDirection = 'prev' | 'next';

/** Chapter switching handled by the site itself (no page load), e.g. a chapter `<select>`. */
export interface InPageNavigation {
  go(direction: ChapterDirection): Promise<boolean>;
}

/** A source whose pages keep arriving after detection (the site decodes them lazily). */
export interface LivePages {
  /** Called whenever the site makes page `index` available. Returns a function that stops listening. */
  subscribe(onPage: (index: number, element: HTMLImageElement) => void): () => void;
  /** Ask the site to move its own reader to `index`, so it keeps preloading what comes next. */
  syncTo(index: number): void;
  /** Blocking state reported by the site, if any. */
  blocker(): 'consent' | 'activation' | null;
}

export interface Chapter {
  pages: Page[];
  meta: ChapterMeta;
  /** Page to open on (0-based), when the site says where the reader is. */
  startPage?: number;
  /** `true` when the detection is reliable enough to open the reader without asking. */
  confident: boolean;
  inPage?: InPageNavigation;
  live?: LivePages;
}

/** Everything a site adapter may read. Injected so adapters can be tested against saved HTML. */
export interface DetectContext {
  document: Document;
  url: URL;
  viewportWidth: number;
  fetchJson: (url: string) => Promise<unknown>;
}

export interface SiteAdapter {
  /** Stable identifier, used in logs and tests. */
  readonly id: string;
  /** Cheap check: can this adapter handle the current page? */
  matches(context: DetectContext): boolean;
  /** Extract the chapter, or `null` when the page does not hold one. */
  extract(context: DetectContext): Chapter | null | Promise<Chapter | null>;
}

export type ReaderAction =
  | 'next'
  | 'prev'
  | 'first'
  | 'last'
  | 'toggleUi'
  | 'cycleMode'
  | 'toggleTheme'
  | 'toggleDirection'
  | 'toggleOffset'
  | 'cycleAnimation'
  | 'fullscreen'
  | 'zoom'
  | 'nextChapter'
  | 'prevChapter'
  | 'help'
  | 'close';

/** Messages between the popup and the content script. */
export type RuntimeMessage = { type: 'mr:status' } | { type: 'mr:open' };

export interface ChapterStatus {
  found: boolean;
  open: boolean;
  title: string;
  chapter: string;
  pageCount: number;
}

/** A short message shown over the reader, optionally with one action button. */
export interface ReaderNotice {
  title: string;
  detail: string;
  action?: { label: string; run: () => void };
}

export interface ReaderCallbacks {
  onSettingsChange(settings: Settings): void;
  onPageChange(page: number): void;
  /** The reader played its exit animation; the caller loads the other chapter. */
  onNavigateChapter(direction: ChapterDirection): void;
  onClose(): void;
}

export interface ReaderOptions {
  chapter: Chapter;
  settings: Settings;
  startPage: number;
  callbacks: ReaderCallbacks;
}

/** Public surface of the reader, returned by `openReader()` in `src/reader`. */
export interface ReaderHandle {
  readonly isOpen: boolean;
  updateSettings(settings: Settings): void;
  /** Swap in another chapter without closing (in-page chapter navigation). */
  replaceChapter(chapter: Chapter, startPage: number): void;
  showNotice(notice: ReaderNotice | null): void;
  close(): void;
}
