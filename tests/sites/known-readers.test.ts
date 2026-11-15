import { describe, expect, it } from 'vitest';
import { knownReadersAdapter, READER_SELECTORS } from '@/sites/known-readers';
import { createContext, loadFixture, pageUrls } from './support';

const URL_HERE = 'https://madara.example/manga/kagurabachi/chapter-12/';

describe('knownReadersAdapter', () => {
  const context = createContext(loadFixture('known-reader.html'), URL_HERE);

  it('tries the most reliable containers first', () => {
    expect(READER_SELECTORS[0]).toBe('#readerarea img');
    expect(READER_SELECTORS).toContain('.reading-content img');
  });

  it('matches a known reading container', () => {
    expect(knownReadersAdapter.matches(context)).toBe(true);
    expect(knownReadersAdapter.matches(createContext('<img src="/a.jpg">', URL_HERE))).toBe(false);
  });

  it('reads lazy images once each, with their declared ratio', async () => {
    const chapter = await knownReadersAdapter.extract(context);
    expect(pageUrls(chapter)).toEqual([
      'https://cdn.example.com/k/12/01.jpg',
      'https://cdn.example.com/k/12/02.jpg',
      'https://cdn.example.com/k/12/03.jpg',
    ]);
    expect(chapter?.pages[0]?.ratio).toBe(900 / 1300);
    expect(chapter?.confident).toBe(true);
  });

  it('finds the neighbours among the links and the title in the heading', async () => {
    const chapter = await knownReadersAdapter.extract(context);
    expect(chapter?.meta).toMatchObject({
      title: 'Kagurabachi',
      chapter: '12',
      prevUrl: 'https://madara.example/manga/kagurabachi/chapter-11/',
      nextUrl: 'https://madara.example/manga/kagurabachi/chapter-13/',
    });
  });

  it('needs at least three distinct pages', async () => {
    const html = '<div class="reading-content"><img src="/1.jpg"><img src="/2.jpg"><img src="/2.jpg"></div>';
    expect(await knownReadersAdapter.extract(createContext(html, URL_HERE))).toBeNull();
  });
});
