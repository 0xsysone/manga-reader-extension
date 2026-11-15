import { describe, expect, it } from 'vitest';
import { heuristicAdapter } from '@/sites/heuristic';
import { createContext, loadFixture, pageUrls } from './support';

const URL_HERE = 'https://unknown.example/blue-box/150';

describe('heuristicAdapter', () => {
  const context = createContext(loadFixture('heuristic.html'), URL_HERE);

  it('matches any page', () => {
    expect(heuristicAdapter.matches(createContext('', URL_HERE))).toBe(true);
  });

  it('keeps the largest group of big images, without being confident', async () => {
    const chapter = await heuristicAdapter.extract(context);
    expect(pageUrls(chapter)).toEqual([
      'https://unknown.example/scans/blue-box/150/1.jpg',
      'https://unknown.example/scans/blue-box/150/2.jpg',
      'https://unknown.example/scans/blue-box/150/3.jpg',
    ]);
    expect(chapter?.pages.map((page) => page.ratio)).toEqual([800 / 1150, 800 / 1150, 1600 / 1150]);
    expect(chapter?.confident).toBe(false);
  });

  it('reads the neighbours from the links and the title from the document title', async () => {
    const chapter = await heuristicAdapter.extract(context);
    expect(chapter?.meta).toMatchObject({
      title: 'Blue Box 150 | Unknown Reader',
      chapter: '',
      prevUrl: 'https://unknown.example/blue-box/149',
      nextUrl: 'https://unknown.example/blue-box/151',
    });
  });

  it('applies the viewport threshold', async () => {
    const narrow = createContext(loadFixture('heuristic.html'), URL_HERE, { viewportWidth: 3000 });
    expect(await heuristicAdapter.extract(narrow)).not.toBeNull();
    const html = loadFixture('heuristic.html').replaceAll('width="800"', 'width="479"');
    expect(await heuristicAdapter.extract(createContext(html, URL_HERE, { viewportWidth: 3000 }))).toBeNull();
  });
});
