import { describe, expect, it } from 'vitest';
import { tsReaderAdapter } from '@/sites/ts-reader';
import { createContext, loadFixture, pageUrls } from './support';

const URL_HERE = 'https://scans.example.com/sakamoto-days-chapter-66/';

describe('tsReaderAdapter', () => {
  const context = createContext(loadFixture('ts-reader.html'), URL_HERE);

  it('matches pages calling ts_reader.run', () => {
    expect(tsReaderAdapter.matches(context)).toBe(true);
    expect(tsReaderAdapter.matches(createContext('<p>none</p>', URL_HERE))).toBe(false);
  });

  it('reads the images of the configuration, with the ratios still declared in the reader area', async () => {
    const chapter = await tsReaderAdapter.extract(context);
    expect(pageUrls(chapter)).toEqual([
      'https://cdn.example.com/sd/66/01.jpg',
      'https://cdn.example.com/sd/66/02.jpg',
      'https://cdn.example.com/sd/66/03.jpg',
    ]);
    expect(chapter?.pages.map((page) => page.ratio)).toEqual([800 / 1200, 0, 0]);
  });

  it('keeps same-site neighbours only and reads the title from the series link', async () => {
    const chapter = await tsReaderAdapter.extract(context);
    expect(chapter?.confident).toBe(true);
    expect(chapter?.startPage).toBe(0);
    expect(chapter?.meta).toEqual({
      title: 'Sakamoto Days',
      chapter: '66',
      prevUrl: 'https://scans.example.com/sakamoto-days-chapter-65/',
      nextUrl: null,
      prevLabel: null,
      nextLabel: null,
      seriesUrl: 'https://scans.example.com/manga/sakamoto-days/',
    });
  });

  it('finds nothing when the configuration has no image', async () => {
    const empty = createContext('<script>ts_reader.run({"sources":[]});</script>', URL_HERE);
    expect(tsReaderAdapter.matches(empty)).toBe(true);
    expect(await tsReaderAdapter.extract(empty)).toBeNull();
  });
});
