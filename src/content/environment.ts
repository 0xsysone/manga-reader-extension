/** Everything {@link ChapterSession} needs from the outside world, injected so it can be tested. */
import type { NavigationIntent } from '@/services/tab-state';
import type { Chapter, ReaderHandle, ReaderOptions, Settings } from '@/shared/types';

/** Floating "Read in book mode" button. */
export interface LauncherControl {
  /** Shows the button (re-rendered with `pageCount`); `onOpen` runs on activation. */
  show(options: { pageCount: number; onOpen: () => void }): Promise<void>;
  hide(): void;
}

/** Timers released when the content script is invalidated. */
export interface SessionTimers {
  setTimeout(handler: () => void, delayMs: number): number;
  clearTimeout(id: number): void;
  setInterval(handler: () => void, delayMs: number): number;
  clearInterval(id: number): void;
}

/** Keys of the texts the session shows over the reader. */
export type SessionTextKey =
  | 'consentTitle'
  | 'consentSub'
  | 'consentAction'
  | 'loadingPages'
  | 'loadingPagesSub'
  | 'chapterUnavailable'
  | 'chapterUnavailableSub';

/** Dependencies of {@link ChapterSession}. */
export interface SessionEnvironment {
  /** Detects the chapter shown by the current page (`null` when there is none). */
  detect(): Promise<Chapter | null>;
  openReader(options: ReaderOptions): Promise<ReaderHandle>;
  launcher: LauncherControl;
  settings: {
    load(): Promise<Settings>;
    save(settings: Settings): Promise<void>;
    /** Returns the function that stops watching. */
    watch(onChange: (settings: Settings) => void): () => void;
  };
  positions: {
    load(key: string): Promise<number | null>;
    save(key: string, page: number): Promise<void>;
  };
  navigation: {
    /** Reads and clears what the previous page of this tab asked for. */
    takeIntent(): NavigationIntent;
    /** Position saved by version 1.x for the current page, consumed once. */
    takeLegacyPosition(): number | null;
    leaveIntent(intent: NavigationIntent): void;
    /** Loads another page in the tab. */
    go(url: string): void;
  };
  /** Current page URL. */
  location(): URL;
  timers: SessionTimers;
  text(key: SessionTextKey): string;
  log(message: string, error: unknown): void;
}
