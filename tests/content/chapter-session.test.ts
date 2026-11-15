import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChapterSession, DETECTION_RETRY_DELAYS_MS, URL_CHANGE_SETTLE_MS } from '@/content/chapter-session';
import { LIVE_CHECK_INTERVAL_MS, LOADING_NOTICE_DELAY_MS } from '@/content/live-notices';
import { chapterPositionKey } from '@/services/storage';
import type { Chapter, LivePages } from '@/shared/types';
import { createFakeEnvironment, makeChapter, replaceAnswers } from './fake-environment';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function lastReader(state: ReturnType<typeof createFakeEnvironment>['state']) {
  const reader = state.readers.at(-1);
  if (!reader) throw new Error('No reader was opened');
  return reader;
}

describe('ChapterSession opening', () => {
  it('opens the reader for a confident detection when autoOpen is on', async () => {
    const { env, state, launcher } = createFakeEnvironment([makeChapter()]);
    await new ChapterSession(env).start();

    expect(lastReader(state).options.startPage).toBe(0);
    expect(launcher.visible).toBe(false);
  });

  it('offers the launcher for a heuristic detection, and opens from it', async () => {
    const { env, state, launcher } = createFakeEnvironment([makeChapter({ confident: false })]);
    await new ChapterSession(env).start();

    expect(state.readers).toHaveLength(0);
    expect(launcher.show).toHaveBeenCalledWith(expect.objectContaining({ pageCount: 5 }));
    launcher.onOpen?.();
    await vi.waitFor(() => expect(state.readers).toHaveLength(1));
    expect(launcher.visible).toBe(false);
  });

  it('opens a heuristic detection when the previous page asked to (autostart)', async () => {
    const { env, state } = createFakeEnvironment([makeChapter({ confident: false })]);
    state.intent = { autostart: true, openAtEndPath: null };
    await new ChapterSession(env).start();

    expect(state.readers).toHaveLength(1);
  });

  it('retries detection twice, then gives up', async () => {
    const { env, state, detect } = createFakeEnvironment([null]);
    await new ChapterSession(env).start();

    for (const delay of DETECTION_RETRY_DELAYS_MS) await vi.advanceTimersByTimeAsync(delay);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(detect).toHaveBeenCalledTimes(1 + DETECTION_RETRY_DELAYS_MS.length);
    expect(state.readers).toHaveLength(0);
  });

  it('consumes the navigation flags at start even when no chapter is found', async () => {
    const { env } = createFakeEnvironment([null]);
    await new ChapterSession(env).start();

    expect(env.navigation.takeIntent).toHaveBeenCalledTimes(1);
  });

  it('finds a late chapter on retry', async () => {
    const { env, state } = createFakeEnvironment([null, makeChapter()]);
    await new ChapterSession(env).start();
    await vi.advanceTimersByTimeAsync(DETECTION_RETRY_DELAYS_MS[0] ?? 0);

    expect(state.readers).toHaveLength(1);
  });
});

describe('ChapterSession start page', () => {
  it('resumes the saved position of the chapter', async () => {
    const { env, state } = createFakeEnvironment([makeChapter({ startPage: 2 })]);
    state.positions.set(chapterPositionKey(state.url, '12'), 3);
    await new ChapterSession(env).start();

    expect(lastReader(state).options.startPage).toBe(3);
  });

  it("uses the site's own page when nothing is saved", async () => {
    const { env, state } = createFakeEnvironment([makeChapter({ startPage: 2 })]);
    await new ChapterSession(env).start();

    expect(lastReader(state).options.startPage).toBe(2);
  });

  it('falls back to the 1.x position', async () => {
    const { env, state } = createFakeEnvironment([makeChapter()]);
    state.legacyPosition = 4;
    await new ChapterSession(env).start();

    expect(lastReader(state).options.startPage).toBe(4);
  });

  it('opens on the last page when coming back from the next chapter, once', async () => {
    const { env, state } = createFakeEnvironment([makeChapter()]);
    state.intent = { autostart: true, openAtEndPath: '/ch-12' };
    state.positions.set(chapterPositionKey(state.url, '12'), 1);
    const session = new ChapterSession(env);
    await session.start();

    expect(lastReader(state).options.startPage).toBe(4);
    lastReader(state).close();
    await session.open();
    expect(lastReader(state).options.startPage).toBe(1);
  });

  it('saves the page per chapter as the reader turns pages', async () => {
    const { env, state } = createFakeEnvironment([makeChapter()]);
    await new ChapterSession(env).start();

    lastReader(state).options.callbacks.onPageChange(3);

    expect(state.positions.get(chapterPositionKey(state.url, '12'))).toBe(3);
  });
});

describe('ChapterSession chapter navigation', () => {
  it('loads the previous chapter page, asking it to open at the end', async () => {
    const { env, state } = createFakeEnvironment([makeChapter()]);
    await new ChapterSession(env).start();

    lastReader(state).options.callbacks.onNavigateChapter('prev');
    lastReader(state).options.callbacks.onNavigateChapter('prev');

    expect(env.navigation.leaveIntent).toHaveBeenCalledWith({ autostart: true, openAtEndPath: '/ch-11' });
    expect(env.navigation.go).toHaveBeenCalledTimes(1);
    expect(env.navigation.go).toHaveBeenCalledWith('https://manga.test/ch-11');
  });

  it('ignores in-page navigation requests while one is running', async () => {
    let finish: (moved: boolean) => void = () => undefined;
    const go = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const fresh = makeChapter({ meta: { ...makeChapter().meta, chapter: '13' } }, 8, 'q');
    const { env, state, queue } = createFakeEnvironment([makeChapter({ inPage: { go } })]);
    await new ChapterSession(env).start();
    replaceAnswers(queue, fresh);
    const reader = lastReader(state);

    reader.options.callbacks.onNavigateChapter('prev');
    reader.options.callbacks.onNavigateChapter('prev');
    finish(true);
    await vi.waitFor(() => expect(reader.replaced).toHaveLength(1));

    expect(go).toHaveBeenCalledTimes(1);
    expect(reader.replaced[0]).toEqual({ chapter: fresh, startPage: 7 });
  });

  it('shows a notice when the in-page chapter could not be loaded', async () => {
    const go = vi.fn(() => Promise.resolve(false));
    const { env, state } = createFakeEnvironment([makeChapter({ inPage: { go } })]);
    await new ChapterSession(env).start();
    const reader = lastReader(state);

    reader.options.callbacks.onNavigateChapter('next');
    await vi.waitFor(() => expect(reader.notices).toHaveLength(1));

    expect(reader.notices[0]?.title).toBe('chapterUnavailable');
  });
});

describe('ChapterSession single-page apps', () => {
  it('drops a slow detection of the previous URL', async () => {
    let resolveOld: (chapter: Chapter) => void = () => undefined;
    const slow = new Promise<Chapter>((resolve) => (resolveOld = resolve));
    const { env, state, queue } = createFakeEnvironment([slow]);
    const session = new ChapterSession(env);
    const started = session.start();
    await vi.advanceTimersByTimeAsync(0);

    state.url = new URL('https://manga.test/title/42');
    replaceAnswers(queue, null);
    session.handleLocationChange();
    resolveOld(makeChapter());
    await started;
    await vi.advanceTimersByTimeAsync(URL_CHANGE_SETTLE_MS);

    expect(state.readers).toHaveLength(0);
    expect((await session.status()).found).toBe(false);
  });

  it("rejects the previous chapter's DOM after a URL change, then accepts the new chapter", async () => {
    const first = makeChapter({ confident: false });
    const second = makeChapter({ confident: false, meta: { ...first.meta, chapter: '13' } }, 6, 'n');
    const { env, state, queue, launcher } = createFakeEnvironment([first]);
    const session = new ChapterSession(env);
    await session.start();

    state.url = new URL('https://manga.test/ch-13');
    replaceAnswers(queue, makeChapter({ confident: false }), second);
    session.handleLocationChange();
    expect(launcher.visible).toBe(false);
    await vi.advanceTimersByTimeAsync(URL_CHANGE_SETTLE_MS);
    expect(launcher.visible).toBe(false);
    await vi.advanceTimersByTimeAsync(DETECTION_RETRY_DELAYS_MS[0] ?? 0);

    expect(launcher.show).toHaveBeenLastCalledWith(expect.objectContaining({ pageCount: 6 }));
  });

  it('waits for the reader to close before following a URL change', async () => {
    const { env, state, queue, detect } = createFakeEnvironment([makeChapter()]);
    const session = new ChapterSession(env);
    await session.start();

    state.url = new URL('https://manga.test/elsewhere');
    replaceAnswers(queue, null);
    session.handleLocationChange();
    await vi.advanceTimersByTimeAsync(URL_CHANGE_SETTLE_MS);
    expect(detect).toHaveBeenCalledTimes(1);

    lastReader(state).close();
    await vi.advanceTimersByTimeAsync(URL_CHANGE_SETTLE_MS);
    expect(detect).toHaveBeenCalledTimes(2);
  });
});

describe('ChapterSession settings, live pages and disposal', () => {
  it('forwards settings changed elsewhere to the open reader', async () => {
    const { env, state } = createFakeEnvironment([makeChapter()]);
    await new ChapterSession(env).start();

    for (const listener of state.settingsListeners) listener({ ...state.settings, theme: 'light' });

    expect(lastReader(state).settings.at(-1)?.theme).toBe('light');
  });

  it('shows the consent notice for a blocked live chapter and releases the site on close', async () => {
    const unsubscribe = vi.fn();
    let blocker: ReturnType<LivePages['blocker']> = 'consent';
    const live: LivePages = {
      subscribe: (onPage) => {
        onPage(0, document.createElement('img'));
        return unsubscribe;
      },
      syncTo: vi.fn(),
      blocker: () => blocker,
    };
    const { env, state } = createFakeEnvironment([makeChapter({ live })]);
    await new ChapterSession(env).start();
    const reader = lastReader(state);

    await vi.advanceTimersByTimeAsync(LIVE_CHECK_INTERVAL_MS);
    expect(reader.notices.at(-1)?.title).toBe('consentTitle');
    blocker = null;
    await vi.advanceTimersByTimeAsync(LIVE_CHECK_INTERVAL_MS);
    expect(reader.notices.at(-1)).toBeNull();

    reader.close();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows the loading notice while a live chapter has delivered no page', async () => {
    const live: LivePages = { subscribe: () => vi.fn(), syncTo: vi.fn(), blocker: () => null };
    const { env, state } = createFakeEnvironment([makeChapter({ live })]);
    await new ChapterSession(env).start();

    await vi.advanceTimersByTimeAsync(LOADING_NOTICE_DELAY_MS);

    expect(lastReader(state).notices).toEqual([{ title: 'loadingPages', detail: 'loadingPagesSub' }]);
  });

  it('closes everything on dispose', async () => {
    const unsubscribe = vi.fn();
    const live: LivePages = { subscribe: () => unsubscribe, syncTo: vi.fn(), blocker: () => null };
    const { env, state, launcher } = createFakeEnvironment([makeChapter({ live })]);
    const session = new ChapterSession(env);
    await session.start();

    session.dispose();

    expect(lastReader(state).isOpen).toBe(false);
    expect(unsubscribe).toHaveBeenCalled();
    expect(launcher.visible).toBe(false);
    expect(state.settingsListeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports its status for the popup', async () => {
    const { env } = createFakeEnvironment([makeChapter()]);
    const session = new ChapterSession(env);
    await session.start();

    expect(await session.status()).toEqual({
      found: true,
      open: true,
      title: 'Series',
      chapter: '12',
      pageCount: 5,
    });
  });
});
