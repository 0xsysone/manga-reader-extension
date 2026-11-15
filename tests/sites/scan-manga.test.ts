import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scanMangaAdapter } from '@/sites/scan-manga';
import type { Chapter, DetectContext, LivePages } from '@/shared/types';
import { createContext, loadFixture, markDecoded } from './support';

const CHAPTER_BASE = 'https://www.scan-manga.com/lecture-en-ligne/Kaette-kudasai-Akutsu-san-Chapitre-';
const URL_HERE = `${CHAPTER_BASE}174-FR_584001.html`;
const COLLECT_DEBOUNCE_MS = 60;
const STUCK_AFTER_MS = 80 + 260;
const RESYNC_INTERVAL_MS = 1500;

function fixtureContext(html = loadFixture('scan-manga.html')): DetectContext {
  return createContext(html, URL_HERE);
}

/** Page boxes in reading order (the fixture lists them out of order). */
function sortedBoxes(document: Document): HTMLElement[] {
  return [1, 2, 3].map((page) => {
    const box = document.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (!box) throw new Error(`missing page ${page}`);
    return box;
  });
}

function shownPage(document: Document): number {
  return sortedBoxes(document).findIndex((box) => !box.classList.contains('hidden'));
}

/** Simulates the site's reader: each control shows the next or previous page. */
function simulateSiteReader(
  document: Document,
  forward: 'right' | 'left' = 'right',
): { clicks: () => number } {
  let clicks = 0;
  const step = (delta: number): void => {
    clicks++;
    const boxes = sortedBoxes(document);
    const target = Math.max(0, Math.min(boxes.length - 1, shownPage(document) + delta));
    boxes.forEach((box, index) => box.classList.toggle('hidden', index !== target));
  };
  const backward = forward === 'right' ? 'left' : 'right';
  document.querySelector(`.${forward}-cursor`)?.addEventListener('click', () => step(1));
  document.querySelector(`.${backward}-cursor`)?.addEventListener('click', () => step(-1));
  return { clicks: () => clicks };
}

async function extract(context: DetectContext): Promise<Chapter> {
  const chapter = await scanMangaAdapter.extract(context);
  if (!chapter) throw new Error('no chapter');
  return chapter;
}

function liveOf(chapter: Chapter): LivePages {
  if (!chapter.live) throw new Error('no live pages');
  return chapter.live;
}

describe('scanMangaAdapter', () => {
  it('matches the Scan-Manga reader container', () => {
    expect(scanMangaAdapter.matches(fixtureContext())).toBe(true);
    expect(scanMangaAdapter.matches(createContext('<div id="container"></div>', URL_HERE))).toBe(false);
  });

  it('lists the pages in page order, decoded ones as elements, the others pending', async () => {
    const context = fixtureContext();
    const firstImage = context.document.querySelector<HTMLImageElement>('[data-page="1"] img');
    if (!firstImage) throw new Error('missing image');
    markDecoded(firstImage);
    const chapter = await extract(context);
    expect(chapter.pages).toEqual([
      { source: { kind: 'element', element: firstImage }, ratio: 800 / 1200 },
      { source: { kind: 'pending' }, ratio: 800 / 1200 },
      { source: { kind: 'pending' }, ratio: 1600 / 1200 },
    ]);
    expect(chapter.confident).toBe(true);
    expect(chapter.startPage).toBeUndefined();
  });

  it('builds the neighbour URLs from the arrows and the chapter list', async () => {
    const chapter = await extract(fixtureContext());
    expect(chapter.meta).toEqual({
      title: 'Kaette kudasai! Akutsu-san',
      chapter: '174',
      prevUrl: `${CHAPTER_BASE}173-FR_575315.html`,
      nextUrl: `${CHAPTER_BASE}175-FR_590000.html`,
      prevLabel: null,
      nextLabel: null,
      seriesUrl: null,
    });
  });

  it('ignores hidden arrows and arrows that do not lead to an adjacent chapter', async () => {
    const html = loadFixture('scan-manga.html')
      .replace('class="arrow left"', 'class="arrow left" style="visibility: hidden"')
      .replace('<option value="590000">175</option>', '<option value="590000">12</option>');
    const chapter = await extract(fixtureContext(html));
    expect(chapter.meta.prevUrl).toBeNull();
    expect(chapter.meta.nextUrl).toBeNull();
  });

  it('falls back to the document title without og:title', async () => {
    const html = loadFixture('scan-manga.html').replace(/<meta property="og:title"[^>]*>/, '');
    expect((await extract(fixtureContext(html))).meta.title).toBe('Kaette kudasai Akutsu-san');
  });

  it('finds nothing without page boxes', async () => {
    const context = createContext('<div id="container" class="img_lel"></div>', URL_HERE);
    expect(await scanMangaAdapter.extract(context)).toBeNull();
  });
});

describe('scan-manga live pages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports decoded pages at once, then each newly decoded one after a short debounce', async () => {
    const context = fixtureContext();
    const [first, second] = sortedBoxes(context.document).map((box) => box.querySelector('img'));
    if (!first || !second) throw new Error('missing images');
    markDecoded(first);
    const onPage = vi.fn();
    const unsubscribe = liveOf(await extract(context)).subscribe(onPage);
    expect(onPage.mock.calls).toEqual([[0, first]]);

    markDecoded(second);
    second.setAttribute('src', 'blob:https://www.scan-manga.com/2');
    await vi.advanceTimersByTimeAsync(COLLECT_DEBOUNCE_MS - 1);
    expect(onPage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(onPage.mock.calls).toEqual([
      [0, first],
      [1, second],
    ]);
    unsubscribe();
  });

  it('releases its observer, listener and timers on unsubscribe', async () => {
    const context = fixtureContext();
    const live = liveOf(await extract(context));
    const onPage = vi.fn();
    const unsubscribe = live.subscribe(onPage);
    expect(vi.getTimerCount()).toBe(1);
    const second = sortedBoxes(context.document)[1]?.querySelector('img');
    if (!second) throw new Error('missing image');
    markDecoded(second);
    second.setAttribute('src', 'blob:https://www.scan-manga.com/2');
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
    second.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(RESYNC_INTERVAL_MS);
    expect(onPage).not.toHaveBeenCalled();
  });

  it('drives the site reader to the requested page', async () => {
    const context = fixtureContext();
    const site = simulateSiteReader(context.document);
    const live = liveOf(await extract(context));
    const unsubscribe = live.subscribe(vi.fn());
    live.syncTo(2);
    await vi.advanceTimersByTimeAsync(STUCK_AFTER_MS * 2);
    expect(shownPage(context.document)).toBe(2);
    expect(site.clicks()).toBe(2);
    expect(live.blocker()).toBeNull();
    live.syncTo(99);
    await vi.advanceTimersByTimeAsync(STUCK_AFTER_MS);
    expect(site.clicks()).toBe(2);
    unsubscribe();
  });

  it('learns a site reader whose controls go the other way', async () => {
    const context = fixtureContext();
    sortedBoxes(context.document).forEach((box, index) => box.classList.toggle('hidden', index !== 1));
    const site = simulateSiteReader(context.document, 'left');
    const live = liveOf(await extract(context));
    const unsubscribe = live.subscribe(vi.fn());
    live.syncTo(2);
    await vi.advanceTimersByTimeAsync(STUCK_AFTER_MS * 4);
    expect(shownPage(context.document)).toBe(2);
    // One click the wrong way, then two the right way.
    expect(site.clicks()).toBe(3);
    unsubscribe();
  });

  it('reports an activation blocker when the site ignores the clicks, and retries later', async () => {
    const context = fixtureContext();
    const live = liveOf(await extract(context));
    const unsubscribe = live.subscribe(vi.fn());
    live.syncTo(1);
    await vi.advanceTimersByTimeAsync(STUCK_AFTER_MS);
    expect(live.blocker()).toBe('activation');

    simulateSiteReader(context.document);
    await vi.advanceTimersByTimeAsync(RESYNC_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(STUCK_AFTER_MS);
    expect(shownPage(context.document)).toBe(1);
    expect(live.blocker()).toBeNull();
    unsubscribe();
  });

  it('reports a consent blocker while a cookie banner is shown', async () => {
    const context = fixtureContext();
    const banner = context.document.createElement('div');
    banner.id = 'didomi-host';
    context.document.body.append(banner);
    vi.spyOn(banner, 'getClientRects').mockReturnValue([
      new DOMRect(0, 0, 100, 100),
    ] as unknown as DOMRectList);
    const live = liveOf(await extract(context));
    const unsubscribe = live.subscribe(vi.fn());
    live.syncTo(1);
    await vi.advanceTimersByTimeAsync(STUCK_AFTER_MS);
    expect(live.blocker()).toBe('consent');
    unsubscribe();
  });

  it('does not touch the site reader without an active subscription', async () => {
    const context = fixtureContext();
    const site = simulateSiteReader(context.document);
    const live = liveOf(await extract(context));
    live.syncTo(2);
    await vi.advanceTimersByTimeAsync(STUCK_AFTER_MS);
    expect(site.clicks()).toBe(0);

    const unsubscribe = live.subscribe(vi.fn());
    unsubscribe();
    unsubscribe();
    live.syncTo(2);
    await vi.advanceTimersByTimeAsync(RESYNC_INTERVAL_MS);
    expect(site.clicks()).toBe(0);
  });

  it('stops a sync in progress when the last subscription ends', async () => {
    const context = fixtureContext();
    const site = simulateSiteReader(context.document);
    const live = liveOf(await extract(context));
    const unsubscribe = live.subscribe(vi.fn());
    live.syncTo(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(site.clicks()).toBe(1);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(STUCK_AFTER_MS * 2);
    expect(site.clicks()).toBe(1);
  });
});
