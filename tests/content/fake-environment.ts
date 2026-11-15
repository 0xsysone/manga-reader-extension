/** Test double of {@link SessionEnvironment}, with an in-memory reader. */
import { vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import type { SessionEnvironment } from '@/content/environment';
import type { NavigationIntent } from '@/services/tab-state';
import type { Chapter, ReaderHandle, ReaderNotice, ReaderOptions, Settings } from '@/shared/types';

/** Reader double recording what the session asks. */
export class FakeReader implements ReaderHandle {
  isOpen = true;
  notices: (ReaderNotice | null)[] = [];
  replaced: { chapter: Chapter; startPage: number }[] = [];
  settings: Settings[] = [];

  constructor(readonly options: ReaderOptions) {}

  updateSettings(settings: Settings): void {
    this.settings.push(settings);
  }
  replaceChapter(chapter: Chapter, startPage: number): void {
    this.replaced.push({ chapter, startPage });
  }
  showNotice(notice: ReaderNotice | null): void {
    this.notices.push(notice);
  }
  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.options.callbacks.onClose();
  }
}

/** Builds a chapter with `count` URL pages. */
export function makeChapter(overrides: Partial<Chapter> = {}, count = 5, prefix = 'p'): Chapter {
  return {
    pages: Array.from({ length: count }, (_, index) => ({
      source: { kind: 'url' as const, url: `https://img.test/${prefix}${index}.jpg` },
      ratio: 0.7,
    })),
    meta: {
      title: 'Series',
      chapter: '12',
      prevUrl: 'https://manga.test/ch-11',
      nextUrl: 'https://manga.test/ch-13',
      prevLabel: null,
      nextLabel: null,
      seriesUrl: null,
    },
    confident: true,
    ...overrides,
  };
}

/** Replaces the pending detection answers. */
export function replaceAnswers(queue: unknown[], ...answers: unknown[]): void {
  queue.length = 0;
  queue.push(...answers);
}

/** Mutable state of the fake environment. */
export interface FakeState {
  url: URL;
  settings: Settings;
  positions: Map<string, number>;
  intent: NavigationIntent;
  legacyPosition: number | null;
  readers: FakeReader[];
  settingsListeners: Set<(settings: Settings) => void>;
}

/** Creates the environment; `detect` answers from the queue (last answer repeats). */
export function createFakeEnvironment(answers: (Chapter | null | Promise<Chapter | null>)[] = []) {
  const state: FakeState = {
    url: new URL('https://manga.test/ch-12'),
    settings: { ...DEFAULT_SETTINGS },
    positions: new Map(),
    intent: { autostart: false, openAtEndPath: null },
    legacyPosition: null,
    readers: [],
    settingsListeners: new Set(),
  };
  const queue = [...answers];
  const detect = vi.fn(() =>
    Promise.resolve(queue.length > 1 ? (queue.shift() ?? null) : (queue[0] ?? null)),
  );
  const launcher = {
    visible: false,
    onOpen: null as (() => void) | null,
    show: vi.fn((options: { pageCount: number; onOpen: () => void }) => {
      launcher.visible = true;
      launcher.onOpen = options.onOpen;
      return Promise.resolve();
    }),
    hide: vi.fn(() => {
      launcher.visible = false;
    }),
  };
  const env = {
    detect,
    openReader: vi.fn((options: ReaderOptions) => {
      const reader = new FakeReader(options);
      state.readers.push(reader);
      return Promise.resolve(reader);
    }),
    launcher,
    settings: {
      load: () => Promise.resolve(state.settings),
      save: vi.fn((settings: Settings) => {
        state.settings = settings;
        return Promise.resolve();
      }),
      watch: (onChange: (settings: Settings) => void) => {
        state.settingsListeners.add(onChange);
        return () => state.settingsListeners.delete(onChange);
      },
    },
    positions: {
      load: (key: string) => Promise.resolve(state.positions.get(key) ?? null),
      save: vi.fn((key: string, page: number) => {
        state.positions.set(key, page);
        return Promise.resolve();
      }),
    },
    navigation: {
      takeIntent: vi.fn(() => {
        const intent = state.intent;
        state.intent = { autostart: false, openAtEndPath: null };
        return intent;
      }),
      takeLegacyPosition: () => state.legacyPosition,
      leaveIntent: vi.fn(),
      go: vi.fn(),
    },
    location: () => state.url,
    timers: {
      setTimeout: (handler: () => void, delay: number) => window.setTimeout(handler, delay),
      clearTimeout: (id: number) => {
        window.clearTimeout(id);
      },
      setInterval: (handler: () => void, delay: number) => window.setInterval(handler, delay),
      clearInterval: (id: number) => {
        window.clearInterval(id);
      },
    },
    text: (key: string) => key,
    log: vi.fn(),
  } satisfies SessionEnvironment;
  return { env, state, queue, launcher, detect };
}
