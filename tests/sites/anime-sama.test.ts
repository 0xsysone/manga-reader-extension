import { afterEach, describe, expect, it, vi } from 'vitest';
import { animeSamaAdapter, IN_PAGE_CHAPTER_URLS } from '@/sites/anime-sama';
import { createContext, loadFixture, pageUrls } from './support';

const URL_HERE = 'https://anime-sama.example/catalogue/kaiju-no-8/scan/vf/';
const SETTLE_DELAY_MS = 200;
const TIMEOUT_MS = 8000;

function fixtureContext() {
  return createContext(loadFixture('anime-sama.html'), URL_HERE);
}

describe('animeSamaAdapter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches the scans box with a chapter list', () => {
    expect(animeSamaAdapter.matches(fixtureContext())).toBe(true);
    expect(animeSamaAdapter.matches(createContext('<div id="scansPlacement"></div>', URL_HERE))).toBe(false);
    const noOptions = '<div id="scansPlacement"></div><select id="selectChapitres"></select>';
    expect(animeSamaAdapter.matches(createContext(noOptions, URL_HERE))).toBe(false);
  });

  it('reads the pages, the series title and the chapter labels around the selected one', async () => {
    const chapter = await animeSamaAdapter.extract(fixtureContext());
    expect(pageUrls(chapter)).toEqual([
      'https://cdn.anime-sama.example/s/kaiju/2/1.jpg',
      'https://cdn.anime-sama.example/s/kaiju/2/2.jpg',
    ]);
    expect(chapter?.pages[0]?.ratio).toBe(0.7);
    expect(chapter?.meta).toEqual({
      title: 'Kaiju No. 8',
      chapter: '2',
      prevUrl: IN_PAGE_CHAPTER_URLS.prev,
      nextUrl: IN_PAGE_CHAPTER_URLS.next,
      prevLabel: '1',
      nextLabel: '3',
      seriesUrl: null,
    });
    expect(chapter?.inPage).toBeDefined();
  });

  it('has no neighbour past the ends of the list', async () => {
    const html = loadFixture('anime-sama.html').replace(
      '<option selected>Chapitre 2</option>',
      '<option>Chapitre 2</option>',
    );
    const chapter = await animeSamaAdapter.extract(createContext(html, URL_HERE));
    expect(chapter?.meta).toMatchObject({ chapter: '1', prevUrl: null, prevLabel: null, nextLabel: '2' });
  });

  it('switches chapter in place once the first image changed and settled', async () => {
    vi.useFakeTimers();
    const context = fixtureContext();
    const { document } = context;
    document.getElementById('nextChapitre')?.addEventListener('click', () => {
      document
        .querySelector('#scansPlacement img')
        ?.setAttribute('src', 'https://cdn.anime-sama.example/s/kaiju/3/1.jpg');
    });
    const chapter = await animeSamaAdapter.extract(context);
    const switched = chapter?.inPage?.go('next');
    await vi.advanceTimersByTimeAsync(SETTLE_DELAY_MS);
    await expect(switched).resolves.toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives up when the page does not change in time', async () => {
    vi.useFakeTimers();
    const chapter = await animeSamaAdapter.extract(fixtureContext());
    const switched = chapter?.inPage?.go('prev');
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    let settled = false;
    void switched?.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(switched).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails at once without the site button', async () => {
    const html = loadFixture('anime-sama.html').replace('id="nextChapitre"', 'id="other"');
    const chapter = await animeSamaAdapter.extract(createContext(html, URL_HERE));
    await expect(chapter?.inPage?.go('next')).resolves.toBe(false);
  });
});
